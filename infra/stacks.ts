import {
  App,
  Stack,
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  Tags,
  aws_dynamodb as ddb,
  aws_lambda as lambda,
  aws_lambda_event_sources as eventsources,
  aws_sqs as sqs,
  aws_iam as iam,
  aws_logs as logs,
  aws_events as events,
  aws_events_targets as targets,
  aws_s3 as s3,
  aws_cloudfront as cf,
  aws_wafv2 as waf,
  aws_bedrock as bedrock,
  aws_pricingplanmanager as plans,
  aws_cloudwatch as cloudwatch,
  aws_secretsmanager as secretsmanager,
  aws_apigatewayv2 as apigateway,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
  aws_cloudwatch_actions as alarmActions,
  SecretValue,
  CliCredentialsStackSynthesizer,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { VIEWER_NETWORK_CODE } from './viewer-network.js';

export type DeploymentOptions = {
  assetBucketPrefix?: string;
  workloadBoundaryArn?: string;
};

function synthesizer(options: DeploymentOptions, region: string) {
  return options.assetBucketPrefix
    ? new CliCredentialsStackSynthesizer({
        fileAssetsBucketName: `${options.assetBucketPrefix}-${region}`,
      })
    : undefined;
}

export class BackendStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    region: string,
    account?: string,
    options: DeploymentOptions = {},
  ) {
    super(scope, id, { env: { region, account }, synthesizer: synthesizer(options, region) });
    if (options.workloadBoundaryArn)
      iam.PermissionsBoundary.of(this).apply(
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          'WorkloadBoundary',
          options.workloadBoundaryArn,
        ),
      );
    const origin = new CfnParameter(this, 'AppOrigin', {
      type: 'String',
      default: 'https://unconfigured.invalid',
      allowedPattern: 'https://[a-zA-Z0-9.-]+',
    });
    const originSecretArn = new CfnParameter(this, 'OriginSecretArn', {
      type: 'String',
      noEcho: true,
      default: 'arn:aws:secretsmanager:us-east-1:' + '0'.repeat(12) + ':secret:unconfigured',
      allowedPattern: '^arn:aws:secretsmanager:us-east-1:[0-9]{12}:secret:.+$',
    });
    const guardrailId = new CfnParameter(this, 'GuardrailId', {
      type: 'String',
      default: 'unconfigured',
    });
    const guardrailVersion = new CfnParameter(this, 'GuardrailVersion', {
      type: 'String',
      default: '1',
    });
    const generationEnabled = new CfnParameter(this, 'GenerationEnabled', {
      type: 'String',
      default: 'false',
      allowedValues: ['true', 'false'],
    });
    const alertEmail = new CfnParameter(this, 'AlertEmail', {
      type: 'String',
      noEcho: true,
      allowedPattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+',
    });
    const state = new ddb.Table(this, 'State', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      encryption: ddb.TableEncryption.AWS_MANAGED,
      stream: ddb.StreamViewType.NEW_IMAGE,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const content = new ddb.Table(this, 'Content', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      encryption: ddb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    for (const table of [state, content])
      table.addGlobalSecondaryIndex({
        indexName: 'work-due',
        partitionKey: { name: 'work', type: ddb.AttributeType.STRING },
        sortKey: { name: 'due', type: ddb.AttributeType.NUMBER },
        projectionType: ddb.ProjectionType.KEYS_ONLY,
      });
    const dlq = new sqs.Queue(this, 'DeadLetters', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(4),
      enforceSSL: true,
    });
    const queue = new sqs.Queue(this, 'ReadingJobs', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(1),
      visibilityTimeout: Duration.seconds(300),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
      enforceSSL: true,
    });
    const common = {
      STATE_TABLE: state.tableName,
      CONTENT_TABLE: content.tableName,
      GENERATION_ENABLED: generationEnabled.valueAsString,
      DAILY_READING_LIMIT: '100',
      MONTHLY_READING_LIMIT: '2000',
      AI_BUDGET_MICROS: '2000000',
    };
    const create = (
      name: string,
      handler: string,
      seconds: number,
      memory: number,
      environment: Record<string, string> = {},
    ) =>
      new lambda.Function(this, name, {
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        handler: `lambda.${handler}`,
        code: lambda.Code.fromAsset('build/lambda'),
        timeout: Duration.seconds(seconds),
        memorySize: memory,
        reservedConcurrentExecutions: name === 'Worker' ? 2 : name === 'Api' ? 5 : 1,
        environment: { ...common, ...environment },
        logGroup: new logs.LogGroup(this, `${name}Logs`, {
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      });
    const networkSecret = new secretsmanager.Secret(this, 'NetworkQuotaSecret', {
      secretName: `${id}-network-quota`,
      description: 'Server-only HMAC key for daily network abuse allowances',
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const api = create('Api', 'apiHandler', 15, 256, {
      APP_ORIGIN: origin.valueAsString,
      NETWORK_SECRET_ARN: networkSecret.secretArn,
      ORIGIN_SECRET_ARN: originSecretArn.valueAsString,
    });
    networkSecret.grantRead(api);
    const authorizer = create('OriginAuthorizer', 'originAuthorizerHandler', 5, 128, {
      ORIGIN_SECRET_ARN: originSecretArn.valueAsString,
    });
    for (const fn of [api, authorizer])
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [originSecretArn.valueAsString],
        }),
      );
    const worker = create('Worker', 'workerHandler', 45, 256, {
      BEDROCK_REGION: 'us-east-1',
      BEDROCK_INFERENCE_PROFILE_ID: 'us.amazon.nova-micro-v1:0',
      BEDROCK_GUARDRAIL_ID: guardrailId.valueAsString,
      BEDROCK_GUARDRAIL_VERSION: guardrailVersion.valueAsString,
    });
    const dispatcher = create('Dispatcher', 'dispatcherHandler', 30, 128, {
      JOB_QUEUE_URL: queue.queueUrl,
    });
    const reconciler = create('Reconciler', 'reconcileHandler', 45, 256, {
      JOB_QUEUE_URL: queue.queueUrl,
    });
    const access = (fn: lambda.Function, keys: string[]) =>
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:DeleteItem',
            'dynamodb:ConditionCheckItem',
          ],
          resources: [state.tableArn, content.tableArn],
          conditions: { 'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': keys } },
        }),
      );
    access(api, [
      'session#*',
      'quota#*',
      'network-quota#*',
      'reading#*',
      'content#*',
      'accepted-day#*',
      'accepted-month#*',
      'outbox#*',
    ]);
    access(worker, [
      'session#*',
      'quota#*',
      'network-quota#*',
      'reading#*',
      'content#*',
      'attempt-day#*',
      'spend-month#*',
      'outbox#*',
    ]);
    worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:ConditionCheckItem'],
        resources: [state.tableArn],
        conditions: {
          'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': ['control#generation'] },
        },
      }),
    );
    access(reconciler, ['reading#*', 'content#*', 'outbox#*', 'network-quota#*']);
    reconciler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query'],
        resources: [`${state.tableArn}/index/work-due`, `${content.tableArn}/index/work-due`],
      }),
    );
    state.grantStreamRead(dispatcher);
    queue.grantSendMessages(dispatcher);
    queue.grantSendMessages(reconciler);
    dispatcher.addEventSource(
      new eventsources.DynamoEventSource(state, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        retryAttempts: 3,
        bisectBatchOnError: true,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: { NewImage: { work: { S: lambda.FilterRule.isEqual('OUTBOX') } } },
          }),
        ],
      }),
    );
    worker.addEventSource(
      new eventsources.SqsEventSource(queue, {
        batchSize: 1,
        reportBatchItemFailures: true,
        maxConcurrency: 2,
      }),
    );
    new events.Rule(this, 'ReconcileEveryFiveMinutes', {
      schedule: events.Schedule.rate(Duration.minutes(5)),
      targets: [new targets.LambdaFunction(reconciler)],
    });
    const profile = `arn:aws:bedrock:us-east-1:${this.account}:inference-profile/us.amazon.nova-micro-v1:0`;
    const models = ['us-east-1', 'us-east-2', 'us-west-2'].map(
      (r) => `arn:aws:bedrock:${r}::foundation-model/amazon.nova-micro-v1:0`,
    );
    worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [profile, ...models],
      }),
    );
    worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:ApplyGuardrail'],
        resources: [
          `arn:aws:bedrock:us-east-1:${this.account}:guardrail/${guardrailId.valueAsString}`,
        ],
      }),
    );
    const http = new apigateway.CfnApi(this, 'HttpApi', {
      name: `${id}-api`,
      protocolType: 'HTTP',
    });
    const auth = new apigateway.CfnAuthorizer(this, 'OriginAuthorization', {
      apiId: http.ref,
      name: 'CloudFrontOrigin',
      authorizerType: 'REQUEST',
      authorizerPayloadFormatVersion: '2.0',
      enableSimpleResponses: true,
      authorizerResultTtlInSeconds: 60,
      identitySource: ['$request.header.x-blue-veil-origin'],
      authorizerUri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${authorizer.functionArn}/invocations`,
    });
    authorizer.addPermission('GatewayAuthorizer', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${region}:${this.account}:${http.ref}/authorizers/${auth.ref}`,
    });
    const integration = new apigateway.CfnIntegration(this, 'ApiIntegration', {
      apiId: http.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: api.functionArn,
      payloadFormatVersion: '2.0',
      timeoutInMillis: 15000,
    });
    new apigateway.CfnRoute(this, 'ApiRoute', {
      apiId: http.ref,
      routeKey: 'ANY /api/{proxy+}',
      target: `integrations/${integration.ref}`,
      authorizationType: 'CUSTOM',
      authorizerId: auth.ref,
    });
    new apigateway.CfnStage(this, 'ApiStage', {
      apiId: http.ref,
      stageName: '$default',
      autoDeploy: true,
      defaultRouteSettings: { throttlingBurstLimit: 10, throttlingRateLimit: 5 },
    });
    api.addPermission('GatewayApi', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${region}:${this.account}:${http.ref}/*/*/api/*`,
    });
    const alerts = new sns.Topic(this, 'Alerts');
    alerts.addSubscription(new subscriptions.EmailSubscription(alertEmail.valueAsString));
    const deadLetters = new cloudwatch.Alarm(this, 'DeadLetterAlarm', {
      metric: dlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    const workerErrors = new cloudwatch.Alarm(this, 'WorkerErrors', {
      metric: worker.metricErrors(),
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    for (const alarm of [deadLetters, workerErrors])
      alarm.addAlarmAction(new alarmActions.SnsAction(alerts));
    new CfnOutput(this, 'ApiHostname', {
      value: `${http.ref}.execute-api.${region}.amazonaws.com`,
    });
    new CfnOutput(this, 'StateTable', { value: state.tableName });
    new CfnOutput(this, 'ContentTable', { value: content.tableName });
    new CfnOutput(this, 'JobQueueUrl', { value: queue.queueUrl });
    new CfnOutput(this, 'AlertsTopicArn', { value: alerts.topicArn });
  }
}

export class EdgeStack extends Stack {
  constructor(scope: Construct, id: string, account?: string, options: DeploymentOptions = {}) {
    super(scope, id, {
      env: { region: 'us-east-1', account },
      synthesizer: synthesizer(options, 'us-east-1'),
    });
    const apiHostname = new CfnParameter(this, 'ApiHostname', {
      type: 'String',
      allowedPattern: '[a-z0-9]+\\.execute-api\\.ap-southeast-7\\.amazonaws\\.com',
    });
    const bucket = new s3.Bucket(this, 'Assets', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(14) }],
    });
    const s3Oac = new cf.CfnOriginAccessControl(this, 'AssetsOac', {
      originAccessControlConfig: {
        name: `${id}-assets`,
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    });
    const originSecret = new secretsmanager.Secret(this, 'OriginSecret', {
      secretName: `${id}-origin-token`,
      description: 'Private CloudFront to HTTP API authentication token',
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const visibility = (name: string) => ({
      sampledRequestsEnabled: false,
      cloudWatchMetricsEnabled: true,
      metricName: name,
    });
    const acl = new waf.CfnWebACL(this, 'Firewall', {
      name: `${id}-firewall`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: visibility('TarotFirewall'),
      rules: [
        {
          name: 'RequestRate',
          priority: 0,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: 1000, aggregateKeyType: 'IP', evaluationWindowSec: 300 },
          },
          visibilityConfig: visibility('RequestRate'),
        },
      ],
    });
    const responseHeaders = new cf.CfnFunction(this, 'Headers', {
      name: `${id}-headers`,
      autoPublish: true,
      functionConfig: { comment: 'Static response security headers', runtime: 'cloudfront-js-2.0' },
      functionCode: `function handler(event){var r=event.response;var h=r.headers;h['content-security-policy']={value:"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};h['x-content-type-options']={value:'nosniff'};h['referrer-policy']={value:'no-referrer'};h['x-frame-options']={value:'DENY'};h['strict-transport-security']={value:'max-age=31536000'};h['permissions-policy']={value:'camera=(), microphone=(), geolocation=()'};return r;}`,
    });
    const functions = [
      { eventType: 'viewer-response', functionArn: responseHeaders.attrFunctionArn },
    ];
    const viewerNetwork = new cf.CfnFunction(this, 'ViewerNetwork', {
      name: `${id}-network`,
      autoPublish: true,
      functionConfig: {
        comment: 'Trusted viewer address for API abuse limits',
        runtime: 'cloudfront-js-2.0',
      },
      functionCode: VIEWER_NETWORK_CODE,
    });
    const disabled = cf.CachePolicy.CACHING_DISABLED.cachePolicyId,
      optimized = cf.CachePolicy.CACHING_OPTIMIZED.cachePolicyId;
    const distribution = new cf.CfnDistribution(this, 'Distribution', {
      distributionConfig: {
        enabled: true,
        comment: 'The Blue Veil',
        defaultRootObject: 'index.html',
        httpVersion: 'http2and3',
        ipv6Enabled: true,
        webAclId: acl.attrArn,
        origins: [
          {
            id: 'assets',
            domainName: bucket.bucketRegionalDomainName,
            s3OriginConfig: { originAccessIdentity: '' },
            originAccessControlId: s3Oac.attrId,
          },
          {
            id: 'api',
            domainName: apiHostname.valueAsString,
            customOriginConfig: {
              originProtocolPolicy: 'https-only',
              originSslProtocols: ['TLSv1.2'],
            },
            originCustomHeaders: [
              {
                headerName: 'x-blue-veil-origin',
                headerValue: SecretValue.secretsManager(originSecret.secretArn).unsafeUnwrap(),
              },
            ],
          },
        ],
        defaultCacheBehavior: {
          targetOriginId: 'assets',
          viewerProtocolPolicy: 'redirect-to-https',
          cachePolicyId: disabled,
          compress: true,
          functionAssociations: functions,
        },
        cacheBehaviors: [
          {
            pathPattern: '/assets/*',
            targetOriginId: 'assets',
            viewerProtocolPolicy: 'redirect-to-https',
            cachePolicyId: optimized,
            compress: true,
            functionAssociations: functions,
          },
          {
            pathPattern: '/api/*',
            targetOriginId: 'api',
            viewerProtocolPolicy: 'https-only',
            allowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
            cachedMethods: ['GET', 'HEAD'],
            cachePolicyId: disabled,
            originRequestPolicyId:
              cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER.originRequestPolicyId,
            functionAssociations: [
              { eventType: 'viewer-request', functionArn: viewerNetwork.attrFunctionArn },
            ],
            compress: true,
          },
        ],
        customErrorResponses: [400, 403, 404, 405, 500, 502, 503, 504].map((errorCode) => ({
          errorCode,
          errorCachingMinTtl: 0,
        })),
      },
    });
    const distributionArn = `arn:aws:cloudfront::${this.account}:distribution/${distribution.ref}`;
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [bucket.arnForObjects('*')],
        conditions: { StringEquals: { 'AWS:SourceArn': distributionArn } },
      }),
    );
    new plans.CfnSubscription(this, 'FreePlan', {
      planFamily: 'CloudFront',
      planTier: 'FREE',
      resourceArns: [distributionArn, acl.attrArn],
    });
    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
      name: `${id}-content`,
      blockedInputMessaging: 'This question needs grounded support rather than a prediction.',
      blockedOutputsMessaging: 'This response could not be shared safely.',
      contentPolicyConfig: {
        filtersConfig: ['SEXUAL', 'VIOLENCE', 'HATE', 'INSULTS', 'MISCONDUCT', 'PROMPT_ATTACK'].map(
          (type) => ({
            type,
            inputStrength: 'HIGH',
            outputStrength: type === 'PROMPT_ATTACK' ? 'NONE' : 'HIGH',
          }),
        ),
      },
    });
    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, 'GuardrailRevision', {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: 'Initial English content policy',
    });
    new CfnOutput(this, 'AppOrigin', { value: `https://${distribution.attrDomainName}` });
    new CfnOutput(this, 'DistributionArn', { value: distributionArn });
    new CfnOutput(this, 'DistributionId', { value: distribution.ref });
    new CfnOutput(this, 'AssetsBucket', { value: bucket.bucketName });
    new CfnOutput(this, 'GuardrailId', { value: guardrail.attrGuardrailId });
    new CfnOutput(this, 'GuardrailVersion', { value: guardrailVersion.attrVersion });
    new CfnOutput(this, 'OriginSecretArn', { value: originSecret.secretArn });
  }
}
export function createApp(
  account?: string,
  region = 'ap-southeast-7',
  options: DeploymentOptions = {},
) {
  const app = new App({ outdir: 'cdk.out' });
  new BackendStack(app, 'TarotBackend', region, account, options);
  new EdgeStack(app, 'TarotEdge', account, options);
  Tags.of(app).add('Project', 'TheBlueVeil');
  Tags.of(app).add('Environment', 'beta');
  return app;
}

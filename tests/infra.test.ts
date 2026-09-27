import { describe, it, expect } from 'vitest';
import { App, Aws } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { BackendStack, EdgeStack } from '../infra/stacks';
describe('infrastructure security', () => {
  it('protects the origin, keeps content out of streams and defaults generation off', () => {
    const stack = new BackendStack(new App(), 'TestBackend', 'ap-southeast-7', undefined, {
      assetBucketPrefix: 'example-blue-veil-staging',
      workloadBoundaryArn: `arn:aws:iam::${Aws.ACCOUNT_ID}:policy/example-runtime-boundary`,
    });
    const t = Template.fromStack(stack);
    for (const role of Object.values(t.findResources('AWS::IAM::Role')))
      expect(role.Properties.PermissionsBoundary).toBeDefined();
    expect(t.toJSON().Rules?.CheckBootstrapVersion).toBeUndefined();
    t.resourceCountIs('AWS::Lambda::Url', 0);
    t.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'HTTP' });
    t.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'ANY /api/{proxy+}',
      AuthorizationType: 'CUSTOM',
      AuthorizerId: Match.anyValue(),
    });
    t.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      IdentitySource: ['$request.header.x-blue-veil-origin'],
      AuthorizerResultTtlInSeconds: 60,
    });
    t.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: { ThrottlingBurstLimit: 10, ThrottlingRateLimit: 5 },
    });
    t.hasParameter('GenerationEnabled', { Default: 'false' });
    t.resourceCountIs('AWS::DynamoDB::Table', 2);
    const tables = t.findResources('AWS::DynamoDB::Table');
    expect(Object.values(tables).filter((x: any) => x.Properties.StreamSpecification)).toHaveLength(
      1,
    );
    t.hasResourceProperties('AWS::Lambda::Permission', {
      Principal: 'apigateway.amazonaws.com',
      SourceArn: Match.anyValue(),
    });
    t.hasResourceProperties('AWS::SQS::Queue', { SqsManagedSseEnabled: true });
    t.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      ScalingConfig: { MaximumConcurrency: 2 },
    });
    for (const alarm of Object.values(t.findResources('AWS::CloudWatch::Alarm')))
      expect(alarm.Properties.AlarmActions).toHaveLength(1);
    t.hasResourceProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: { PasswordLength: 64, ExcludePunctuation: true },
    });
    for (const table of Object.values(tables))
      expect(table.Properties.SSESpecification.SSEEnabled).toBe(true);
    const lambdas = Object.values(t.findResources('AWS::Lambda::Function'));
    expect(lambdas.reduce((sum, fn) => sum + fn.Properties.ReservedConcurrentExecutions, 0)).toBe(
      10,
    );
    expect(
      lambdas.filter((fn: any) => fn.Properties.Environment?.Variables?.NETWORK_SECRET_ARN),
    ).toHaveLength(1);
  });
  it('uses the FREE plan, private assets and an authenticated uncached API', () => {
    const stack = new EdgeStack(new App(), 'TestEdge');
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::PricingPlanManager::Subscription', { PlanTier: 'FREE' });
    t.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: [
        Match.objectLike({
          Statement: {
            RateBasedStatement: { Limit: 1000, AggregateKeyType: 'IP', EvaluationWindowSec: 300 },
          },
        }),
      ],
    });
    t.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    t.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: Match.objectLike({
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
      }),
    });
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Origins: Match.arrayWith([
          Match.objectLike({
            Id: 'api',
            OriginCustomHeaders: [
              Match.objectLike({
                HeaderName: 'x-blue-veil-origin',
                HeaderValue: Match.anyValue(),
              }),
            ],
          }),
        ]),
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/api/*',
            CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
            FunctionAssociations: Match.arrayWith([
              Match.objectLike({ EventType: 'viewer-request', FunctionARN: Match.anyValue() }),
            ]),
          }),
        ]),
      }),
    });
  });
});

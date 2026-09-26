import { describe, it, expect } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { BackendStack, EdgeStack } from '../infra/stacks';
describe('infrastructure security', () => {
  it('protects the origin, keeps content out of streams and defaults generation off', () => {
    const stack = new BackendStack(new App(), 'TestBackend', 'ap-southeast-7');
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'AWS_IAM' });
    t.hasParameter('GenerationEnabled', { Default: 'false' });
    t.resourceCountIs('AWS::DynamoDB::Table', 2);
    const tables = t.findResources('AWS::DynamoDB::Table');
    expect(Object.values(tables).filter((x: any) => x.Properties.StreamSpecification)).toHaveLength(
      1,
    );
    t.hasResourceProperties('AWS::Lambda::Permission', {
      Principal: 'cloudfront.amazonaws.com',
      SourceArn: Match.anyValue(),
    });
    t.hasResourceProperties('AWS::SQS::Queue', { SqsManagedSseEnabled: true });
  });
  it('uses the FREE plan, signed origins, private assets and an uncached API', () => {
    const stack = new EdgeStack(new App(), 'TestEdge');
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::PricingPlanManager::Subscription', { PlanTier: 'FREE' });
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
        OriginAccessControlOriginType: 'lambda',
        SigningBehavior: 'always',
      }),
    });
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/api/*',
            CachePolicyId: '413f160a-7fce-4cc4-9e90-24b55beafc7d',
          }),
        ]),
      }),
    });
  });
});

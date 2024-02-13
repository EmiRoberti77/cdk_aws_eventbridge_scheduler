import * as cdk from 'aws-cdk-lib';
import {
  Effect,
  Policy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { existsSync } from 'fs';
import { scheduler } from 'timers/promises';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CdkEventbridgeLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const recurringPath = './lambdas/recurring.ts';
    if (!existsSync(recurringPath)) {
      console.log('NOT FOUND', recurringPath);
      return;
    }

    const oneOffPath = './lambdas/one-off.ts';
    if (!existsSync(oneOffPath)) {
      console.log('NOT FOUND', oneOffPath);
      return;
    }

    const recurringLambda = new NodejsFunction(this, 'emiRecurringLambda', {
      functionName: 'emiRecurringLambda',
      entry: recurringPath,
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
    });

    const oneOffLambda = new NodejsFunction(this, 'emiOneOffLambda', {
      functionName: 'emiOneOffLambda',
      entry: oneOffPath,
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
    });

    const schedulerRole = new Role(this, 'schedulerRole', {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    });

    const invokeLambdaPolicy = new Policy(this, 'invokeLambdaPolicy', {
      document: new PolicyDocument({
        statements: [
          new PolicyStatement({
            actions: ['lambda:InvokeFunction'],
            resources: [oneOffLambda.functionArn, recurringLambda.functionArn],
            effect: Effect.ALLOW,
          }),
        ],
      }),
    });

    schedulerRole.attachInlinePolicy(invokeLambdaPolicy);

    new cdk.CfnResource(this, 'oneOffSchedule', {
      type: 'AWS::Scheduler::Schedule',
      properties: {
        Name: 'oneOffSchedule',
        Description: 'Runs a schedule at a fixed time',
        FlexibleTimeWindow: { Mode: 'OFF' },
        ScheduleExpression: 'at(2024-02-13T06:30:00)',
        Target: {
          Arn: oneOffLambda.functionArn,
          RoleArn: schedulerRole.roleArn,
        },
      },
    });

    new cdk.CfnResource(this, 'recurringSchedule', {
      type: 'AWS::Scheduler::Schedule',
      properties: {
        Name: 'recurringSchedule',
        Description: 'Runs a schedule every 1 minute',
        FlexibleTimeWindow: { Mode: 'OFF' },
        ScheduleExpression: 'cron(*/1 * * * ? *)',
        Target: {
          Arn: recurringLambda.functionArn,
          RoleArn: schedulerRole.roleArn,
        },
      },
    });

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'CdkEventbridgeLambdaQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}

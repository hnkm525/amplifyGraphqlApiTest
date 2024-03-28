import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import {
  AmplifyGraphqlApi,
  AmplifyGraphqlDefinition,
} from "@aws-amplify/graphql-api-construct";
import {
  Pass,
  StateMachine,
  StateMachineType,
} from "aws-cdk-lib/aws-stepfunctions";
import { Role, ServicePrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, FunctionRuntime } from "aws-cdk-lib/aws-appsync";

export class DocumentManagerStack extends cdk.Stack {
  pool: cognito.UserPool;
  api: AmplifyGraphqlApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Step Functions定義
    const stateMachineDefinition = new Pass(this, "passState", {
      result: { value: "Hello from StepFunctions!" },
    });

    const stateMachine = new StateMachine(this, "SyncStateMachine", {
      definition: stateMachineDefinition,
      stateMachineType: StateMachineType.STANDARD,
    });

    // 認証認可設定
    this.pool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "DocumentManagerUserPool",
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      standardAttributes: { email: { required: true } },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const client = this.pool.addClient("customer-app-client-web", {
      preventUserExistenceErrors: true,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    // API作成
    this.api = new AmplifyGraphqlApi(this, "DocumentManagerApi", {
      definition: AmplifyGraphqlDefinition.fromFiles("graphql/schema.graphql"),
      authorizationModes: {
        userPoolConfig: {
          userPool: this.pool,
        },
      },
    });

    const appsyncStepFunctionsRole = new Role(this, "SyncStateMachineRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });
    appsyncStepFunctionsRole.addToPolicy(
      new PolicyStatement({
        resources: ["*"],
        actions: ["states:StartExecution"],
      })
    );

    // Step Functions起動用のHttpデータソース作成
    const endpoint = "https://states." + this.region + ".amazonaws.com/";
    const httpdatasource = this.api.addHttpDataSource(
      "StepFunctionsStateMachine",
      endpoint,
      {
        authorizationConfig: {
          signingRegion: this.region,
          signingServiceName: "states",
        },
      }
    );

    stateMachine.grant(httpdatasource.grantPrincipal, "states:StartExecution");

    // statemachine起動用関数
    const startExecutionFunction = this.api.addFunction(
      "startExecutionFunction",
      {
        name: "startExecution",
        dataSource: httpdatasource,
        code: Code.fromAsset("graphql/Mutation.startExecution.js"),
        runtime: FunctionRuntime.JS_1_0_0,
      }
    );

    // 前段でstatemachineのARNを渡す関数
    const pipelineVars = JSON.stringify({
      STATE_MACHINE_ARN: stateMachine.stateMachineArn,
    });
    const resolverCodeWithStateMachineArn = `
    // The before step
    export function request(...args) {
      console.log(args);
      return ${pipelineVars}
    }
    // The after step
    export function response(ctx) {
      return ctx.prev.result
    }
    `;

    // statemachineから帰ってきた値をDynamoDBに保存する関数
    const storeExecutionResultFunction = this.api.addFunction(
      "storeExecutionResultFunction",
      {
        name: "storeExecutionResult",
        dataSource: httpdatasource,
        code: Code.fromAsset("graphql/Mutation.storeExecution.js"),
        runtime: FunctionRuntime.JS_1_0_0,
      }
    );

    this.api.addResolver("ExecuteResolver", {
      typeName: "Mutation",
      fieldName: "startExecution",
      code: Code.fromInline(resolverCodeWithStateMachineArn),
      runtime: FunctionRuntime.JS_1_0_0,
      pipelineConfig: [startExecutionFunction, storeExecutionResultFunction],
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: this.pool.userPoolId });
    new cdk.CfnOutput(this, "ClientId", { value: client.userPoolClientId });
  }
}

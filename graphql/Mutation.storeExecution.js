import { util } from "@aws-appsync/utils";

/**
 * Puts an item into the DynamoDB table using an auto-generated ID.
 * @param {import('@aws-appsync/utils').Context<{input: any}>} ctx the context
 * @returns {import('@aws-appsync/utils').DynamoDBPutItemRequest} the request
 */
export function request(ctx) {
  console.log("🍎");
  console.log("ctx", ctx);
  console.log("🍎");

  // TODO: valuesエラー直す
  const { input: values } = ctx.args;
  const key = { id: values.id ?? util.autoId() };
  const condition = { and: [{ id: { attributeExists: false } }] };
  return dynamodbPutRequest({ key, values, condition });
}

/**
 * Returns the item or throws an error if the operation failed.
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the result
 */
export function response(ctx) {
  const { error, result } = ctx;
  if (error) {
    return util.appendError(error.message, error.type, result);
  }
  return result;
}

/**
 * Helper function to create a new item
 * @returns {*} the request
 */
function dynamodbPutRequest(params) {
  const { key, values, condition: inCondObj } = params;

  let condition;
  if (inCondObj) {
    condition = JSON.parse(
      util.transform.toDynamoDBConditionExpression(inCondObj)
    );
    if (
      condition &&
      condition.expressionValues &&
      !Object.keys(condition.expressionValues).length
    ) {
      delete condition.expressionValues;
    }
  }
  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues(key),
    attributeValues: util.dynamodb.toMapValues(values),
    condition,
  };
}

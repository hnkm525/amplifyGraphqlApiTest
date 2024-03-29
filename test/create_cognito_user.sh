#!/bin/bash

USER_POOL_ID=$(cat ../output.json | jq -r '.DocumentManagerStack.UserPoolId')
CLIENT_ID=$(cat ../output.json | jq -r '.DocumentManagerStack.ClientId')
echo $USER_POOL_ID
echo $CLIENT_ID

aws cognito-idp sign-up \
  --client-id $CLIENT_ID \
  --username tester \
  --password Password1234! \
  --user-attributes Name=email,Value=example@example.com

aws cognito-idp admin-confirm-sign-up \
  --user-pool-id $USER_POOL_ID \
  --username tester

Useful resources to learn from:
* build in cloud & deploy to cloud run lab: https://www.cloudskillsboost.google/course_sessions/6018538/labs/418343
* create cloud sql instance: https://cloud.google.com/sql/docs/mysql/connect-instance-cloud-run#deploy_sample_app_to_cloud_run
* connect to db and crate tables: https://cloud.google.com/sql/docs/mysql/connect-admin-ip
* connect node app to cloud sql: https://github.com/GoogleCloudPlatform/nodejs-docs-samples/blob/main/cloud-sql/mysql/mysql2/README.md
* use Secret Manager: https://www.youtube.com/watch?v=JIE89dneaGo


set local env variables so i can commit this file
```sh
source .env.production.local
```

build the image in the cloud
```sh
gcloud builds submit --tag gcr.io/"$GOOGLE_CLOUD_PROJECT"/"$IMAGE_NAME"
```

### Option A (unsafe): deploy using environment variables

actual deploy (taken from web-based creator and customized)
```sh
gcloud run deploy "$APP_NAME" \
--image=gcr.io/"$GOOGLE_CLOUD_PROJECT"/"$IMAGE_NAME" \
--set-env-vars=BASE_URL="$BASE_URL",\
INSTANCE_CONNECTION_NAME="$INSTANCE_CONNECTION_NAME",\
DB_USER="$DB_USER",\
DB_PASS="$DB_PASS",\
DB_NAME="$DB_NAME",\
GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID",\
GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET",\
GOOGLE_REDIRECT_URI="$GOOGLE_REDIRECT_URI",\
GOOGLE_MAPS_API_KEY="$GOOGLE_MAPS_API_KEY",\
COOKIE_SECRET="$COOKIE_SECRET" \
--set-cloudsql-instances="$SQL_INSTANCE" \
--region=europe-west4 \
--project="$GOOGLE_CLOUD_PROJECT" \
 && gcloud run services update-traffic "$APP_NAME" --to-latest
```

### Option B (recommended): user Google's Secret Manager

First, create a DB_PASS secret in Secret Manager in Google Cloud Console and add 'Secret Manager Accessor' role to the account that operates the Cloud Run instance.

Then actual deploy (taken from web-based creator and customized). Notice that we don't declare `DB_PASS` variable.
```sh
gcloud run deploy "$APP_NAME" \
--image=gcr.io/"$GOOGLE_CLOUD_PROJECT"/"$IMAGE_NAME" \
--set-env-vars=BASE_URL="$BASE_URL",\
INSTANCE_CONNECTION_NAME="$INSTANCE_CONNECTION_NAME",\
DB_USER="$DB_USER",\
DB_NAME="$DB_NAME",\
GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID",\
GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET",\
GOOGLE_REDIRECT_URI="$GOOGLE_REDIRECT_URI",\
GOOGLE_MAPS_API_KEY="$GOOGLE_MAPS_API_KEY",\
COOKIE_SECRET="$COOKIE_SECRET" \
--set-secrets=DB_PASS=DB_PASS:latest \
--set-cloudsql-instances="$SQL_INSTANCE" \
--region=europe-west4 \
--project="$GOOGLE_CLOUD_PROJECT" \
 && gcloud run services update-traffic "$APP_NAME" --to-latest
```
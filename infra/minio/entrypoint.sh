#!/bin/bash

# We have Bash in the minio/mc image, so we will take advantage of it

required_variables=(
    MINIO_ROOT_USER
    MINIO_ROOT_PASSWORD

    MINIO_WAREHOUSE_BUCKET
    MINIO_URL

    MINIO_WAREHOUSE_USER

    MINIO_WAREHOUSE_PASSWORD
)

for var in "${required_variables[@]}"; do
    if [ -z "${!var}" ]; then
        echo "Missing required variable $var"
        exit 1
    fi
done

echo "Configuration verified. Performing setup..."

mc alias set minio "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
until mc ready minio; do
    echo "Waiting for MinIO to start..."
    sleep 1
done

mc mb --ignore-existing minio/"$MINIO_WAREHOUSE_BUCKET"

mc admin user add minio "$MINIO_WAREHOUSE_USER" "$MINIO_WAREHOUSE_PASSWORD"

cat <<EOF > /tmp/policy.json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": ["s3:ListBucket"],
            "Resource": ["arn:aws:s3:::$MINIO_WAREHOUSE_BUCKET"]
        },
        {
            "Effect": "Allow",
            "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            "Resource": ["arn:aws:s3:::$MINIO_WAREHOUSE_BUCKET/*"]
        }
    ]
}
EOF

mc admin policy create minio warehouse /tmp/policy.json
mc admin policy attach minio warehouse --user "$MINIO_WAREHOUSE_USER" || true

echo "Setup complete."

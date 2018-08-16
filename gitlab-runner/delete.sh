#/bin/bash

oc delete template/gitlab-runner
oc delete sa/sa-gitlab-runner
oc delete is/is-gitlab-runner
oc delete bc/gitlab-runner
oc delete service/gitlab-runner-service
oc delete dc/dc-gitlab-runner-service

oc delete sa/sa-minio
oc delete is/is-minio
oc delete service/minio-service
oc delete dc/dc-minio-service

oc delete cm/cm-gitlab-runner
oc delete rolebindings/edit

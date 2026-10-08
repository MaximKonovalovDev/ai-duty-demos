# Deploy service

The project deploy flow lives in this file of the repo.
A rollout ships the docker image to canary first, then the kubernetes fleet.
Run the rollback check in the node service when the canary rollout stalls.

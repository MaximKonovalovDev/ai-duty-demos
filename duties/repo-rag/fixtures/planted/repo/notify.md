# Notify service

The project alert flow lives in this file of the repo.
An incident fires a webhook that posts to the slack channel and pages the
on-call pager with the alert summary.
Run the node check on every webhook before the repo pages twice.

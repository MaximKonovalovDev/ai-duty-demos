# Spec: report page (clean)

1. The login page returns HTTP 200 for a valid session cookie.
2. The report is generated within 2 seconds for up to 1000 rows.
3. The page title reads "Approve queue".
4. A rejected row never reappears in the waiting list.
5. The export file name contains the date as YYYY-MM-DD.

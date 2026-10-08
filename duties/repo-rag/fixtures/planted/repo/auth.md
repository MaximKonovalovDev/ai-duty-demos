# Auth service

The project login flow lives in this file of the repo.
Users log in with a password, receive a session token, and refresh the
passport token before it expires.
Run the logout check after every password rotation in the node service.

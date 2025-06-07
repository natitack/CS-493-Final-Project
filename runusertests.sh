#!/bin/sh

HOST=localhost
PORT=8000

BASEURL="http://${HOST}:${PORT}"

GREEN=$(tput setaf 10)
RESET=$(tput sgr0)

status() {
    printf "\n%s╓─────────────────────────────────────────────────────\n" "$GREEN"
    printf "║ %s\n" "$*"
    printf "╙─────────────────────────────────────────────────────\n%s" "$RESET"
}

tempfile=curl.out.$$.tmp

status "Attempting admin login"

curl -s -X POST $BASEURL/users/login \
-H "Content-Type: application/json" \
-d '{"email": "admin@example.com", "password": "adminpassword"}' | tee $tempfile

echo

if grep -q '"token"' $tempfile; then
    status "Admin login successful!"
else
    status "Admin login FAILED."
fi

# Extract token for use in next request
TOKEN=$(grep '"token"' $tempfile | sed -E 's/.*"token"[ ]*:[ ]*"([^"]*)".*/\1/')

rm -f $tempfile

# Test: Create a new user
tempfile=curl.out.$$.tmp

status "Creating a new user"

curl -s -X POST $BASEURL/users \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN" \
-d '{"name": "John Doe", "email": "john@example.com", "password": "securepassword"}' | tee $tempfile

echo

if grep -q '"id"' $tempfile; then
    status "User creation successful!"
else
    status "User creation FAILED."
fi

rm -f $tempfile

# Test: User login (valid credentials)
tempfile=curl.out.$$.tmp

status "Logging in as new user"

curl -s -X POST $BASEURL/users/login \
-H "Content-Type: application/json" \
-d '{"email": "john@example.com", "password": "securepassword"}' | tee $tempfile

echo

if grep -q '"token"' $tempfile; then
    status "User login successful!"
    USER_TOKEN=$(grep '"token"' $tempfile | sed -E 's/.*"token"[ ]*:[ ]*"([^"]*)".*/\1/')
else
    status "User login FAILED."
fi

rm -f $tempfile


# Test: User login (invalid credentials)
tempfile=curl.out.$$.tmp

status "Logging in with invalid credentials"

curl -s -X POST $BASEURL/users/login \
-H "Content-Type: application/json" \
-d '{"email": "john@example.com", "password": "wrongpassword"}' | tee $tempfile

echo

if grep -q '"token"' $tempfile; then
    status "User login with invalid credentials should have FAILED but succeeded."
else
    status "User login with invalid credentials correctly failed."
fi

rm -f $tempfile
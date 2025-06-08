#!/bin/sh

# Rate Limiting Test Script
# Tests the Express.js rate limiting middleware with different user roles and scenarios

id=""
token=""
httpstatus=""
response_body=""

status() {
    local msg="$*"

    printf "\n|===================================================\n"
    printf "| %s\n" "$msg"
    printf "|===================================================\n"
}

sub_status() {
    local msg="$*"
    printf "\n   %s\n" "$msg"
}

# Extractors
extract_id() {
    local json_file="$1"
    awk -F'"id":"' '{print $2}' "$json_file" | awk -F'"' '{print $1}'
}

extract_token() {
    local json_file="$1"
    local possible_token=$(awk -F'"token":"' '{print $2}' "$json_file" | awk -F'"' '{print $1}')

    if [ -n "$possible_token" ]; then
        token="$possible_token"
    fi
}

extract_rate_limit_remaining() {
    local header_file="$1"
    grep -i "x-ratelimit-remaining:" "$header_file" | awk '{print $2}' | tr -d '\r'
}

extract_rate_limit_limit() {
    local header_file="$1"
    grep -i "x-ratelimit-limit:" "$header_file" | awk '{print $2}' | tr -d '\r'
}

extract_rate_limit_user_type() {
    local header_file="$1"
    grep -i "x-ratelimit-user-type:" "$header_file" | awk '{print $2}' | tr -d '\r'
}

extract_retry_after() {
    local header_file="$1"
    grep -i "retry-after:" "$header_file" | awk '{print $2}' | tr -d '\r'
}

get() {
    local url="$1"
    local _token="$2"

    sub_status "GET $url"

    if [ -n "$_token" ]; then
        httpstatus=$(curl -s -w "%{response_code}" -D headers.out -H "Authorization: Bearer $_token" "$url" -o curl.out)
    else 
        httpstatus=$(curl -s -w "%{response_code}" -D headers.out "$url" -o curl.out)
    fi
    
    response_body=$(cat curl.out)
    id=$(extract_id curl.out)
    extract_token curl.out
}

post_json() {
    local url="$1"
    local payload="$2"
    local _token="$3"

    sub_status "POST $url"

    if [ -n "$_token" ]; then
        httpstatus=$(curl -s -w "%{response_code}" -D headers.out -H "Content-Type: application/json" \
            -H "Authorization: Bearer $_token" -d "$payload" "$url" -o curl.out)
    else
        httpstatus=$(curl -s -w "%{response_code}" -D headers.out -H "Content-Type: application/json" \
            -d "$payload" "$url" -o curl.out)
    fi

    response_body=$(cat curl.out)
    id=$(extract_id curl.out)
    extract_token curl.out
}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_result() {
    local EXPECTED_STATUS=$1
    local ACTUAL_STATUS=$httpstatus
    local MESSAGE=$2
    local BODY=$response_body

    if [ "$EXPECTED_STATUS" = "$ACTUAL_STATUS" ]; then
        echo -e "\t${GREEN}✓ $MESSAGE${NC}"
        if [ -f headers.out ]; then
            local remaining=$(extract_rate_limit_remaining headers.out)
            local limit=$(extract_rate_limit_limit headers.out)
            local user_type=$(extract_rate_limit_user_type headers.out)
            if [ -n "$remaining" ] && [ -n "$limit" ]; then
                echo -e "\t\tRate Limit: $remaining/$limit remaining (User: $user_type)"
            fi
        fi
        echo -e "\t\tResponse: $BODY"
    else
        echo -e "\t${RED}✗ $MESSAGE"
        echo -e "\tStatus code: $ACTUAL_STATUS != $EXPECTED_STATUS"
        echo -e "\tResponse: $BODY${NC}"
        if [ -f headers.out ]; then
            echo -e "\tHeaders:"
            cat headers.out | grep -i "x-ratelimit\|retry-after" | sed 's/^/\t\t/'
        fi
        exit 1
    fi
}

test_rate_limit_headers() {
    local MESSAGE=$1
    local EXPECTED_USER_TYPE=$2
    
    if [ -f headers.out ]; then
        local remaining=$(extract_rate_limit_remaining headers.out)
        local limit=$(extract_rate_limit_limit headers.out)
        local user_type=$(extract_rate_limit_user_type headers.out)
        
        if [ -n "$remaining" ] && [ -n "$limit" ] && [ -n "$user_type" ]; then
            if [ "$user_type" = "$EXPECTED_USER_TYPE" ]; then
                echo -e "\t${GREEN}✓ $MESSAGE - Headers present and correct${NC}"
                echo -e "\t\tUser Type: $user_type, Remaining: $remaining/$limit"
            else
                echo -e "\t${RED}✗ $MESSAGE - Wrong user type: $user_type != $EXPECTED_USER_TYPE${NC}"
                exit 1
            fi
        else
            echo -e "\t${RED}✗ $MESSAGE - Missing rate limit headers${NC}"
            exit 1
        fi
    else
        echo -e "\t${RED}✗ $MESSAGE - No headers file${NC}"
        exit 1
    fi
}

wait_for_rate_limit_reset() {
    local seconds=$1
    echo -e "\t${YELLOW}Waiting $seconds seconds for rate limit reset...${NC}"
    sleep $seconds
}

cleanup() {
    rm -f curl.out headers.out
}

############# MAIN #############

PORT=8000
URL="http://localhost:${PORT}"

# Test endpoint - using the router structure
TEST_ENDPOINT="$URL/test"

status "Rate Limiting Tests"

# Test 1: Anonymous user rate limiting (IP-based)
status "Test Anonymous User Rate Limiting (5 requests per minute)"

# Make requests up to the limit
for i in 1 2 3 4 5; do
    get $TEST_ENDPOINT
    test_result 200 "Anonymous request $i/5 should succeed"
    test_rate_limit_headers "Rate limit headers check" "anonymous"
done

# Test rate limit exceeded for anonymous user
get $TEST_ENDPOINT
test_result 429 "Anonymous request 6/5 should be rate limited"

# Check retry-after header
if [ -f headers.out ]; then
    retry_after=$(extract_retry_after headers.out)
    if [ -n "$retry_after" ]; then
        echo -e "\t${GREEN}✓ Retry-After header present: $retry_after seconds${NC}"
    else
        echo -e "\t${RED}✗ Retry-After header missing${NC}"
        exit 1
    fi
fi

# Wait for rate limit reset
wait_for_rate_limit_reset 61

# Test that requests work again after reset
get $TEST_ENDPOINT
test_result 200 "Anonymous request should work after reset"

# Test 2: Student user rate limiting (20 requests per minute)
status "Test Student User Rate Limiting (20 requests per minute)"

# Login as student to get token
# Note: This assumes you have actual user accounts in your database
post_json "$URL/users/login" '{
    "email": "student@example.com",
    "password": "studentpassword"
}'
test_result 200 "Student login successful"
student_token="$token"

# Make requests up to the limit
for i in $(seq 1 20); do
    get $TEST_ENDPOINT "$student_token"
    test_result 200 "Student request $i/20 should succeed"
    if [ "$i" -eq 1 ] || [ "$i" -eq 10 ] || [ "$i" -eq 20 ]; then
        test_rate_limit_headers "Student rate limit headers check" "student"
    fi
done

# Test rate limit exceeded for student
get $TEST_ENDPOINT "$student_token"
test_result 429 "Student request 21/20 should be rate limited"

wait_for_rate_limit_reset 61

# Test 3: Instructor user rate limiting (50 requests per minute)
status "Test Instructor User Rate Limiting (50 requests per minute)"

# Login as instructor
post_json "$URL/users/login" '{
    "email": "instructor@example.com",
    "password": "instructorpassword"
}'
test_result 200 "Instructor login successful"
instructor_token="$token"

# Test first few requests
for i in 1 2 3; do
    get $TEST_ENDPOINT "$instructor_token"
    test_result 200 "Instructor request $i should succeed"
    test_rate_limit_headers "Instructor rate limit headers check" "instructor"
done

# Test many requests quickly (simulate burst)
for i in $(seq 4 25); do
    get $TEST_ENDPOINT "$instructor_token" > /dev/null 2>&1
done

get $TEST_ENDPOINT "$instructor_token"
test_result 200 "Instructor should still have requests remaining after 25 requests"

# Test 4: Admin user rate limiting (100 requests per minute)
status "Test Admin User Rate Limiting (100 requests per minute)"

# Login as admin
post_json "$URL/users/login" '{
    "email": "admin@example.com",
    "password": "adminpassword"
}'
test_result 200 "Admin login successful"
admin_token="$token"

# Test first few requests
for i in 1 2 3; do
    get $TEST_ENDPOINT "$admin_token"
    test_result 200 "Admin request $i should succeed"
    test_rate_limit_headers "Admin rate limit headers check" "admin"
done

# Test many requests quickly
for i in $(seq 4 50); do
    get $TEST_ENDPOINT "$admin_token" > /dev/null 2>&1
done

get $TEST_ENDPOINT "$admin_token"
test_result 200 "Admin should still have requests remaining after 50 requests"

# Test 5: Different users don't share rate limits
status "Test User Isolation - Different users have separate rate limits"

# Reset by waiting
wait_for_rate_limit_reset 61

# Make requests with different tokens simultaneously
get $TEST_ENDPOINT "$student_token"
test_result 200 "Student request after reset should work"

get $TEST_ENDPOINT "$instructor_token"
test_result 200 "Instructor request should work independently"

get $TEST_ENDPOINT "$admin_token"
test_result 200 "Admin request should work independently"

# Test 6: Invalid token falls back to IP-based limiting
status "Test Invalid Token Fallback to IP-based Rate Limiting"

wait_for_rate_limit_reset 61

# Use invalid token - should fall back to IP-based limiting (5 requests)
invalid_token="invalid_token_123"

for i in 1 2 3 4 5; do
    get $TEST_ENDPOINT "$invalid_token"
    test_result 200 "Invalid token request $i/5 should succeed (IP-based)"
    test_rate_limit_headers "Invalid token rate limit headers" "anonymous"
done

# Should be rate limited after 5 requests
get $TEST_ENDPOINT "$invalid_token"
test_result 429 "Invalid token request 6/5 should be rate limited"

# Test 7: Rate limit persistence across requests
status "Test Rate Limit State Persistence"

wait_for_rate_limit_reset 61

# Make some requests with student token
for i in 1 2 3; do
    get $TEST_ENDPOINT "$student_token"
    test_result 200 "Student persistence test request $i"
done

# Check that the counter persisted
get $TEST_ENDPOINT "$student_token"
test_result 200 "Student request should show decremented counter"

if [ -f headers.out ]; then
    remaining=$(extract_rate_limit_remaining headers.out)
    if [ "$remaining" -lt 19 ]; then
        echo -e "\t${GREEN}✓ Rate limit counter persisted correctly${NC}"
    else
        echo -e "\t${RED}✗ Rate limit counter not persisting: $remaining${NC}"
        exit 1
    fi
fi

cleanup

echo -e "\n${GREEN}|==================================================="
echo -e "| All Rate Limiting Tests Passed!" 
echo -e "|===================================================${NC}"

exit 0
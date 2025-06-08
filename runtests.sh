#!/bin/sh

# set always/when detected when a call is made
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

    #printf "\n   |-------------------------\n"
    printf "\n   %s\n" "$msg"
    #printf "   |-------------------------\n"
}

# extractors
extract_id() {
    local json_file="$1"
    awk -F'"id":"' '{print $2}' "$json_file" | awk -F'"' '{print $1}'
}
ai_extract_status() {
    local json_file="$1"
    awk -F'"status":"' '{print $2}' "$json_file" | awk -F'"' '{print $1}'
}
extract_token() {
    local json_file="$1"
    awk -F'"token":"' '{print $2}' "$json_file" | awk -F'"' '{print $1}'

    #if [ -n "$possible_token" ]; then
    #    token="$possible_token"
    #fi
}

get() {
    local url="$1"
    local _token="$2"

    sub_status "GET $url"

    if [ -n "$_token" ]; then
        httpstatus=$(curl -s -w "%{response_code}" -H "Authorization: Bearer $_token" "$url" -o curl.out)
    else 
        httpstatus=$(curl -s -w "%{response_code}" "$url" -o curl.out)
    fi
    
    response_body=$(cat curl.out)
    id=$(extract_id curl.out)
    token=$(extract_token curl.out)
    rm -f curl.out
}

post_json() {
    local url="$1"
    local payload="$2"
    local _token="$3"

    sub_status "POST $url"

    if [ -n "$_token" ]; then
        httpstatus=$(curl -s -w "%{response_code}" -H "Content-Type: application/json" \
            -H "Authorization: Bearer $_token" -d "$payload" "$url" -o curl.out)
    else
        httpstatus=$(curl -s -w "%{response_code}" -H "Content-Type: application/json" \
            -d "$payload" "$url" -o curl.out)
    fi

    response_body=$(cat curl.out)
    id=$(extract_id curl.out)
    token=$(extract_token curl.out)
    rm -f curl.out
}

put_json() {
    local url="$1"
    local payload="$2"
    local _token="$3"

    sub_status "PUT $url"

    if [ -n "$_token" ]; then
        httpstatus=$(curl -X PUT -s -w "%{response_code}" -H "Content-Type: application/json" \
            -H "Authorization: Bearer $_token" -d "$payload" "$url" -o curl.out)
    else
        httpstatus=$(curl -X PUT -s -w "%{response_code}" -H "Content-Type: application/json" \
            -d "$payload" "$url" -o curl.out)
    fi
    
    response_body=$(cat curl.out)
    id=$(extract_id curl.out)
    token=$(extract_token curl.out)
    rm -f curl.out
}

delete(){
    local url="$1"
    local _token="$2"

    sub_status "DELETE $url"

    if [ -n "$_token" ]; then
        httpstatus=$(curl -X DELETE -s -w "%{response_code}" -H "Authorization: Bearer $_token" "$url" -o curl.out)
    else
        httpstatus=$(curl -X DELETE -s -w "%{response_code}" "$url" -o curl.out)
    fi

    response_body=$(cat curl.out)
    #id=$(extract_id curl.out)
    token=$(extract_token curl.out)
    rm -f curl.out
}

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

test_result() {
    local EXPECTED_STATUS=$1
    local ACTUAL_STATUS=$httpstatus
    local MESSAGE=$2
    local BODY=$response_body

    if [ $EXPECTED_STATUS == $ACTUAL_STATUS ]; then
        echo -e "\t${GREEN}✓ $MESSAGE${NC}"
        echo -e "\t\tResponse: $BODY$"
    else
        echo -e "\t${RED}✗ $MESSAGE"
        echo -e "\tStatus code: $ACTUAL_STATUS != $EXPECTED_STATUS"
        echo -e "\tResponse: $BODY${NC}"
        exit 1
    fi
}

############# MAIN #############

PORT=8000
URL="http://localhost:${PORT}"

status "Setup all logins and users for test"

post_json $URL/users/login '{
    "email": "admin@example.com",
    "password": "adminpassword"
}'

test_result 200 "Login as admin"

admin_token="$token"
echo "\nadmin_token extracted: $admin_token\n"

post_json $URL/users '{
    "name": "Test Instructor",
    "email": "instructor@test.com",
    "password": "instructorpass",
    "role": "instructor"
}' "$admin_token"
test_result 201 "Create instructor"
instructor_id=$id

post_json $URL/users '{
    "name": "Test Student",
    "email": "student@test.com",
    "password": "studentpass",
    "role": "student"
}' "$admin_token"
test_result 201 "Create student"
student_id=$id

post_json $URL/users/login '{
    "email": "instructor@test.com",
    "password": "instructorpass"
}'
test_result 200 "Login as instructor"
instructor_token="$token"

post_json $URL/users/login '{
    "email": "student@test.com",
    "password": "studentpass"
}'
test_result 200 "Login as student"
student_token="$token"

post_json $URL/courses '{
    "subject": "CS",
    "number": "493",
    "title": "Test Course for API Testing",
    "term": "Fall 2024",
    "instructorId": "'$instructor_id'"
}' "$admin_token"
test_result 201 "Create test course"
course_id=$id

post_json $URL/courses/$course_id/students '{
    "add": ["'$student_id'"]
}' "$instructor_token"
test_result 200 "Enroll student in course"

status "Test assignments/"

post_json $URL/assignments '{
    "courseId": "'$course_id'",
    "title": "Test Assignment 1",
    "points": 100,
    "due": "2025-12-31T23:59:59.000Z"
}' "$instructor_token"
test_result 201 "Create assignment"
assignment_id=$id

get $URL/assignments/$assignment_id
test_result 200 "Get assignment details"

put_json $URL/assignments/$assignment_id '{
    "title": "Updated Test Assignment 1",
    "points": 120
}' "$instructor_token"
test_result 200 "Update assignment"

post_json $URL/assignments '{
    "courseId": "'$course_id'",
    "title": "Unauthorized Assignment",
    "points": 50,
    "due": "2024-12-31T23:59:59.000Z"
}' "$student_token"
test_result 403 "Assignment creation blocked for student"

post_json $URL/assignments '{
    "courseId": "'$course_id'",
    "title": "Unauthorized Assignment",
    "points": 50,
    "due": "2024-12-31T23:59:59.000Z"
}'
test_result 401 "Assignment creation blocked without auth"

post_json $URL/assignments '{
    "courseId": "'$course_id'",
    "title": "Admin Assignment",
    "points": 80,
    "due": "2024-12-31T23:59:59.000Z"
}' "$admin_token"
test_result 201 "Create assignment as admin"
admin_assignment_id=$id

# status "other stuff"

# # Explicitly extract token from response_body
# token=$(echo "$response_body" | grep -o '"token"[ ]*:[ ]*"[^"]*"' | awk -F'"' '{print $4}')



# tempfile="curl.out.$$"

# status "Creating a new user"

# httpstatus=$(curl -s -w "%{response_code}" -X POST $URL/users \
#     -H "Content-Type: application/json" \
#     -H "Authorization: Bearer $token" \
#     -d '{"name": "John Doe", "email": "john@example.com", "password": "securepassword"}' -o $tempfile)
# response_body=$(cat $tempfile)
# if grep -q '"id"' $tempfile; then
#     echo -e "\t${GREEN}✓ User creation successful!${NC}"
# else
#     echo -e "\t${RED}✗ User creation FAILED.${NC}"
#     echo -e "\tResponse: $response_body"
# fi
# rm -f $tempfile

# status "Logging in as new user"

# httpstatus=$(curl -s -w "%{response_code}" -X POST $URL/users/login \
#     -H "Content-Type: application/json" \
#     -d '{"email": "john@example.com", "password": "securepassword"}' -o $tempfile)
# response_body=$(cat $tempfile)
# if grep -q '"token"' $tempfile; then
#     echo -e "\t${GREEN}✓ User login successful!${NC}"
#     USER_TOKEN=$(grep '"token"' $tempfile | sed -E 's/.*"token"[ ]*:[ ]*"([^"]*)".*/\1/')
# else
#     echo -e "\t${RED}✗ User login FAILED.${NC}"
#     echo -e "\tResponse: $response_body"
# fi
# rm -f $tempfile

# status "Logging in with invalid credentials"

# httpstatus=$(curl -s -w "%{response_code}" -X POST $URL/users/login \
#     -H "Content-Type: application/json" \
#     -d '{"email": "john@example.com", "password": "wrongpassword"}' -o $tempfile)
# response_body=$(cat $tempfile)
# if grep -q '"token"' $tempfile; then
#     echo -e "\t${RED}✗ User login with invalid credentials should have FAILED but succeeded.${NC}"
# else
#     echo -e "\t${GREEN}✓ User login with invalid credentials correctly failed.${NC}"
# fi
# rm -f $tempfile



echo -e "\n${GREEN}|==================================================="
echo -e "| Tests Passed!" 
echo -e "|===================================================${NC}"

exit 0
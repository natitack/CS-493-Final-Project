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

extract_file_url() {
    local json_response="$1"
    echo "$json_response" | grep -o '"file"[ ]*:[ ]*"[^"]*"' | awk -F'"' '{print $4}'
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

post_file() {
    local url="$1"
    local file_path="$2"
    local _token="$3"

    sub_status "POST $url (file upload)"

    if [ -n "$_token" ]; then
        httpstatus=$(curl -s -w "%{response_code}" \
            -H "Authorization: Bearer $_token" \
            -F "file=@$file_path" "$url" -o curl.out)
    else
        httpstatus=$(curl -s -w "%{response_code}" \
            -F "file=@$file_path" "$url" -o curl.out)
    fi

    response_body=$(cat curl.out)
    id=$(extract_id curl.out)
    token=$(extract_token curl.out)
    rm -f curl.out
}

get_file_download() {
    local url="$1"
    local _token="$2"
    local output_file="$3"

    sub_status "GET $url (file download)"

    if [ -n "$_token" ]; then
        httpstatus=$(curl -s -w "%{response_code}" -H "Authorization: Bearer $_token" "$url" -o "$output_file")
    else 
        httpstatus=$(curl -s -w "%{response_code}" "$url" -o "$output_file")
    fi
    
    # For file downloads, we don't parse JSON response
    response_body="File download response"
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

patch_json() {
    local url="$1"
    local payload="$2"
    local _token="$3"

    sub_status "PATCH $url"

    if [ -n "$_token" ]; then
        httpstatus=$(curl -X PATCH -s -w "%{response_code}" -H "Content-Type: application/json" \
            -H "Authorization: Bearer $_token" -d "$payload" "$url" -o curl.out)
    else
        httpstatus=$(curl -X PATCH -s -w "%{response_code}" -H "Content-Type: application/json" \
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

post_json $URL/users '{
    "name": "Test Student 2",
    "email": "student2@test.com",
    "password": "studentpass2",
    "role": "student"
}' "$admin_token"
test_result 201 "Create second student"
student2_id=$id

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

post_json $URL/users/login '{
    "email": "student2@test.com",
    "password": "studentpass2"
}'
test_result 200 "Login as second student"
student2_token="$token"

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

patch_json $URL/assignments/$assignment_id '{
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

status "Test submission endpoints"

# Test submission creation with file uploads
post_file $URL/assignments/$assignment_id/submissions "test.pdf" "$student_token"
test_result 201 "Create submission with PDF file"
submission_id=$id
submission_file_url=$(extract_file_url "$response_body")

post_file $URL/assignments/$assignment_id/submissions "test.png" "$student_token"
test_result 201 "Create submission with PNG file"

post_file $URL/assignments/$assignment_id/submissions "test.odt" "$student_token"
test_result 201 "Create submission with ODT file"
odt_submission_id=$id
odt_file_url=$(extract_file_url "$response_body")

# Test submission creation without authentication
post_file $URL/assignments/$assignment_id/submissions "test.pdf"
test_result 401 "Submission creation blocked without auth"

# Test submission creation as instructor (should fail)
post_file $URL/assignments/$assignment_id/submissions "test.pdf" "$instructor_token"
test_result 403 "Submission creation blocked for instructor"

# Test submission creation as admin (should fail)
post_file $URL/assignments/$assignment_id/submissions "test.pdf" "$admin_token"
test_result 403 "Submission creation blocked for admin"

# Test submission creation for non-enrolled student
post_file $URL/assignments/$assignment_id/submissions "test.pdf" "$student2_token"
test_result 403 "Submission creation blocked for non-enrolled student"

# Test submission creation without file
post_json $URL/assignments/$assignment_id/submissions '{}' "$student_token"
test_result 400 "Submission creation blocked without file"

# Test submission creation for non-existent assignment
post_file $URL/assignments/507f1f77bcf86cd799439011/submissions "test.pdf" "$student_token"
test_result 404 "Submission creation blocked for non-existent assignment"

status "Test submission listing endpoints"

# Test getting submissions as instructor
get $URL/assignments/$assignment_id/submissions "$instructor_token"
test_result 200 "Get submissions as instructor"

# Test getting submissions as admin
get $URL/assignments/$assignment_id/submissions "$admin_token"
test_result 200 "Get submissions as admin"

# Test getting submissions as student (should fail)
get $URL/assignments/$assignment_id/submissions "$student_token"
test_result 403 "Get submissions blocked for student"

# Test getting submissions without auth
get $URL/assignments/$assignment_id/submissions
test_result 401 "Get submissions blocked without auth"

# Test getting submissions with pagination
get $URL/assignments/$assignment_id/submissions?page=1&limit=2 "$instructor_token"
test_result 200 "Get submissions with pagination"

# Test getting submissions filtered by student
get $URL/assignments/$assignment_id/submissions?studentId=$student_id "$instructor_token"
test_result 200 "Get submissions filtered by student ID"

# Test getting submissions for non-existent assignment
get $URL/assignments/507f1f77bcf86cd799439011/submissions "$instructor_token"
test_result 404 "Get submissions blocked for non-existent assignment"

status "Test file download endpoints"

# Extract filename from the file URL for download tests
if [ -n "$submission_file_url" ]; then
    filename=$(basename "$submission_file_url")
    
    # Test file download as the student who uploaded it
    get_file_download $URL$submission_file_url "$student_token" "downloaded_test.pdf"
    test_result 200 "Download file as submitting student"
    
    # Verify the downloaded file exists and has content
    if [ -s "downloaded_test.pdf" ]; then
        echo -e "\t${GREEN}✓ Downloaded file has content${NC}"
        rm -f "downloaded_test.pdf"
    else
        echo -e "\t${RED}✗ Downloaded file is empty or missing${NC}"
        exit 1
    fi
    
    # Test file download as instructor
    get_file_download $URL$submission_file_url "$instructor_token" "downloaded_test_instructor.pdf"
    test_result 200 "Download file as instructor"
    rm -f "downloaded_test_instructor.pdf"
    
    # Test file download as admin
    get_file_download $URL$submission_file_url "$admin_token" "downloaded_test_admin.pdf"
    test_result 200 "Download file as admin"
    rm -f "downloaded_test_admin.pdf"
    
    # Test file download as different student (should fail)
    get_file_download $URL$submission_file_url "$student2_token" "downloaded_test_unauthorized.pdf"
    test_result 403 "Download file blocked for unauthorized student"
    rm -f "downloaded_test_unauthorized.pdf"
    
    # Test file download without authentication
    get_file_download $URL$submission_file_url "" "downloaded_test_noauth.pdf"
    test_result 401 "Download file blocked without auth"
    rm -f "downloaded_test_noauth.pdf"
fi

# Test ODT file download
if [ -n "$odt_file_url" ]; then
    get_file_download $URL$odt_file_url "$student_token" "downloaded_test.odt"
    test_result 200 "Download ODT file as submitting student"
    rm -f "downloaded_test.odt"
fi

# Test download of non-existent file
get_file_download $URL/api/assignments/submissions/download/nonexistent-file.pdf "$student_token" "nonexistent.pdf"
test_result 404 "Download non-existent file returns 404"
rm -f "nonexistent.pdf"

status "Test file upload validation"

# Create a test file with invalid content type
echo "This is a text file pretending to be executable" > test_invalid.exe

# Test upload of invalid file type (should fail)
post_file $URL/assignments/$assignment_id/submissions "test_invalid.exe" "$student_token"
test_result 400 "Upload invalid file type blocked"

# Clean up test file
rm -f test_invalid.exe

status "Test submission edge cases"

# Test submission to assignment in course where student is not enrolled
post_json $URL/courses '{
    "subject": "CS",
    "number": "494",
    "title": "Another Test Course",
    "term": "Fall 2024",
    "instructorId": "'$instructor_id'"
}' "$admin_token"
test_result 201 "Create second test course"
course2_id=$id

post_json $URL/assignments '{
    "courseId": "'$course2_id'",
    "title": "Assignment in Different Course",
    "points": 100,
    "due": "2025-12-31T23:59:59.000Z"
}' "$instructor_token"
test_result 201 "Create assignment in second course"
assignment2_id=$id

# Student should not be able to submit to assignment in course they're not enrolled in
post_file $URL/assignments/$assignment2_id/submissions "test.pdf" "$student_token"
test_result 403 "Submission blocked for non-enrolled course"





echo -e "\n${GREEN}|==================================================="
echo -e "| Tests Passed!" 
echo -e "|===================================================${NC}"

exit 0
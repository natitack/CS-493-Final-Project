#!/bin/sh

id=""
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

extract_id() {
    local json_file="$1"
    awk -F'"id":"' '{print $2}' "$json_file" | awk -F'"' '{print $1}'
}
ai_extract_status() {
    local json_file="$1"
    awk -F'"status":"' '{print $2}' "$json_file" | awk -F'"' '{print $1}'
}

get() {
    local url="$1"

    sub_status "GET $url"

    httpstatus=$(curl -s -w "%{response_code}" "$url" -o curl.out)
    response_body=$(cat curl.out)
    id=$(extract_id curl.out)
    rm -f curl.out
}

post_json() {
    local url="$1"
    local payload="$2"

    sub_status "POST $url"

    httpstatus=$(curl -s -w "%{response_code}" -H "Content-Type: application/json" \
        -d "$payload" "$url" -o curl.out)
    response_body=$(cat curl.out)
    id=$(extract_id curl.out)
    rm -f curl.out
}

put_json() {
    local url="$1"
    local payload="$2"

    sub_status "POST $url"

    httpstatus=$(curl -X PUT -s -w "%{response_code}" -H "Content-Type: application/json" \
        -d "$payload" "$url" -o curl.out)
    response_body=$(cat curl.out)
    id=$(extract_id curl.out)
    rm -f curl.out
}

delete(){
    local url="$1"

    sub_status "DELETE $url"

    httpstatus=$(curl -X DELETE -s -w "%{response_code}" "$url" -o curl.out)
    response_body=$(cat curl.out)
    #id=$(extract_id curl.out)
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

status "Test /assignments"

sub_status "Test post /"



#Example test from my project 2 tests

#status "Test /reviews"

#get $URL/reviews/$new_review_id
#test_result 200 "Can get /reviews/id"

#put_json $URL/reviews/$new_review_id '{
#        "dollars": "1",
#        "review": "Awesome and really cool online model database"
#    }'
#test_result 200 "Can put /reviews/id"

#get $URL/reviews/$new_review_id
#test_result 200 "Get updated /reviews/id"


echo -e "\n${GREEN}|==================================================="
echo -e "| Tests Passed!" 
echo -e "|===================================================${NC}"

exit 0
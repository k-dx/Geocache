#!/bin/bash

# create the database
sudo mysql -h 127.0.0.1 -u root -p < /home/kuba/Geocache/geocache.session.sql

# create the users (by sending POST requests to the server cuz password hashing)
for i in {1..10}
do
  curl -X POST http://localhost:3000/register -d "username=user$i&email=user$i@example.com&password=password"
done

sudo mysql -h 127.0.0.1 -u root -p geocache < /home/kuba/Geocache/example-data.session.sql
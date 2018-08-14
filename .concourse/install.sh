#!/bin/sh

npm --versions
node -v
meteor --version
meteor npm --versions
meteor node -v
git version

meteor npm install

git submodule init && git submodule update

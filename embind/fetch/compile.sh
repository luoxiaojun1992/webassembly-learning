#! /bin/bash

emcc fetch.cpp -s DEMANGLE_SUPPORT=1 --bind -o fetch.js

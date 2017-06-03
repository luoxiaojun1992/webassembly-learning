#! /bin/bash

emcc fetch.cpp -s FETCH=1 -s USE_PTHREADS=1 --bind -o fetch.js

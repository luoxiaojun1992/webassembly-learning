#! /bin/bash

emcc http.c -Os -s WASM=1 -s SIDE_MODULE=1 -o http.wasm


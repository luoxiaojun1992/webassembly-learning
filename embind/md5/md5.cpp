// quick_example.cpp
#include <emscripten/bind.h>
#include "./md5.hpp"

using namespace emscripten;

std::string md5(std::string str) {
  return MD5(str).toStr();
}

// Binding code
EMSCRIPTEN_BINDINGS(my_class_example) {
  function("md5", &md5);
}

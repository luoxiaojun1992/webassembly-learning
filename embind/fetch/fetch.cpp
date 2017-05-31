#include <emscripten/emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/fetch.h>
#include <string>

using namespace emscripten;

std::string httpGet() {
  emscripten_fetch_attr_t attr;
  emscripten_fetch_attr_init(&attr);
  strcpy(attr.requestMethod, "GET");
  attr.attributes = EMSCRIPTEN_FETCH_LOAD_TO_MEMORY | EMSCRIPTEN_FETCH_SYNCHRONOUS;
  emscripten_fetch_t *fetch = emscripten_fetch(&attr, "http://www.qianshengqian.com/"); // Blocks here until the operation is complete.
  emscripten_fetch_close(fetch);
  if (fetch->status == 200) {
    // The data is now available at fetch->data[0] through fetch->data[fetch->numBytes-1];
    return (std::string)fetch->data;
  } else {
    return "";
  }
}

std::string test() {
  return "test";
}

// Binding code
EMSCRIPTEN_BINDINGS(my_class_example) {
  function("httpGet", &httpGet);
  function("test", &test);
}

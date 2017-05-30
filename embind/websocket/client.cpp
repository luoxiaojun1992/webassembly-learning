#include "websocket-clientpp.cpp"
#include <emscripten/bind.h>
#include <memory>

using namespace emscripten;

class MyClass {
public:
  MyClass(int x, std::string y)
    : x(x)
    , y(y)
  {}

  void incrementX() {
    ++x;
  }

  int getX() const { return x; }
  void setX(int x_) { x = x_; }

  static std::string getStringFromInstance(const MyClass& instance) {
    return instance.y;
  }

  static std::string fetch() {
    std::unique_ptr<websocket::WebSocket> ws(
        websocket::create_connection("ws://127.0.0.1:9501"));

    if (ws == nullptr) {
      return "Unable to connect server";
    }

    ws->send("hello");
    return ws->recv();
  }

private:
  int x;
  std::string y;
};

// Binding code
EMSCRIPTEN_BINDINGS(my_class_example) {
  class_<MyClass>("MyClass")
    .constructor<int, std::string>()
    .function("incrementX", &MyClass::incrementX)
    .property("x", &MyClass::getX, &MyClass::setX)
    .class_function("getStringFromInstance", &MyClass::getStringFromInstance)
    .class_function("fetch", &MyClass::fetch)
    ;
}

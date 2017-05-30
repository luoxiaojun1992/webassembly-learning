#include "Socket.hpp"
#include <emscripten/bind.h>

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
    try
    {
        Socket::UDP sock;

        sock.bind(9501);

        sock.send("127.0.0.1", 9501, "request");

        Socket::Datagram received = sock.receive();

        // sock.close();

        return received.data;
    }
    catch (Socket::Exception &e)
    {
        return e.what();
    }
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

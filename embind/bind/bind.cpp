// quick_example.cpp
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

private:
  int x;
  std::string y;
};

float add(float a, float b, float c) {
	return a + b + c;
}

int sum(std::string arr, int len) {
  int sum = 0;
  for (int i = 0; i < len; ++i) {
    sum += arr[i];
  }

  return sum;
}

int max(std::string arr, int len) {
  int max = 0;
  if (len > 1) {
    max = arr[0];
    for (int i = 1; i < len; ++i) {
      if (arr[i] > max) {
        max = arr[i];
      }
    }
  }

  return max;
}

int min(std::string arr, int len) {
  int min = 0;
  if (len > 1) {
    min = arr[0];
    for (int i = 1; i < len; ++i) {
      if (arr[i] < min) {
        min = arr[i];
      }
    }
  }

  return min;
}

// Binding code
EMSCRIPTEN_BINDINGS(my_class_example) {
  class_<MyClass>("MyClass")
    .constructor<int, std::string>()
    .function("incrementX", &MyClass::incrementX)
    .property("x", &MyClass::getX, &MyClass::setX)
    .class_function("getStringFromInstance", &MyClass::getStringFromInstance)
    ;
	function("add", &add);
  function("sum", &sum);
  function("max", &max);
  function("min", &min);
}

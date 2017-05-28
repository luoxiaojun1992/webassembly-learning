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

  std::sort(std::begin(arr), std::end(arr));

  return sum;
}

std::string sort(std::string arr, int len) {
  int tmp = 0;
  for (int i = 0; i < len; ++i) {
    for (int j = i + 1; j < len; j++) {
      if (arr[j] < arr[i]) {
        tmp = arr[j];
        arr[j] = arr[i];
        arr[i] = tmp;
      }
    }
  }
  return arr;
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
  function("sort", &sort);
}

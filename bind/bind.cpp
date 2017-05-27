#include <emscripten/bind.h>
#include <stdio.h>

using namespace emscripten;

float lerp(float a, float b, float t) {
			printf("test");
	    return (1 - t) * a + t * b;
}

float addThree(int a) {
  return 0;
}

EMSCRIPTEN_BINDINGS(my_module) {
	    function("lerp", &lerp);
			function("addThree", &addThree);
}

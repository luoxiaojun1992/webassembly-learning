// math.c
#include <stdio.h>

int add(int x, int y) {
	return x + y;
}

int square(int x) {
	return x * x;
}

int sum(int * arr) {
	int sum = 0;
	arr++;
	sum += *arr;
	return sum;
}

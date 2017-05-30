#include "websocket-clientpp.hpp"

#include <iostream>
#include <memory>
#include <vector>

int main() {
  std::unique_ptr<websocket::WebSocket> ws(
      websocket::create_connection("ws://echo.websocket.org"));

  if (ws == nullptr) {
    std::cerr << "Unable to connect server" << std::endl;
    return 1;
  }

  std::vector<std::string> messages = {"hello", "world", "this",
                                       "is",    "echo",  "test"};
  for (const auto& message : messages) {
    ws->send(message);
    std::cout << ws->recv() << std::endl;
  }
  return 0;
}

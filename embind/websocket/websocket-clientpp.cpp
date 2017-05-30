#include "websocket-clientpp.hpp"

#include <cstdio>
#include <stdio.h>
#include <string.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdlib.h>
#include <netinet/tcp.h>

namespace {

constexpr int INVALID_SOCKET = -1;
constexpr int SOCKET_ERROR = -1;

}  // anonymous namespace

namespace websocket {

namespace internal {

bool parse_url(const std::string& url, std::string* host, std::string* path,
               int* port) {
  // TODO: Use regex or external lib
  if (url.find("ws://") == std::string::npos) {
    return false;
  }

  *host = url.substr(url.find("ws://") + 5);

  *path = host->substr(host->find("/") + 1);
  if (*path == *host) *path = "";
  while (path->size() && path->at(0) == '/') {
    *path = path->substr(1);
  }

  *host = host->substr(0, host->find("/"));

  auto colon_pos = host->find(":");
  if (colon_pos == std::string::npos) {
    *port = 80;
  } else {
    auto port_str = host->substr(colon_pos + 1);

    *port = std::stoi(port_str, nullptr);
    *host = host->substr(0, host->find(":"));
  }

  return true;
}

std::string read_line(int sockfd) {
  std::string line;
  char buf[2] = {0, 0};

  while (buf[0] != '\r' && buf[1] != '\n') {
    buf[0] = buf[1];
    if (!::recv(sockfd, buf + 1, 1, 0))
      return "";
    else
      line += buf[1];
  }
  return line;
}

bool check_header(int sockfd) {
  std::string line;
  if (read_line(sockfd).find("HTTP/1.1 101") != 0) {
    return false;
  }
  while ((line = read_line(sockfd).c_str()) != "\r\n") {
    if (line.empty()) return false;
  }
  return true;
}

int establish_connection(const int sockfd, const std::string& host,
                         const std::string& path, const int port) {
  char line[256];

  snprintf(line, 256, "GET /%s HTTP/1.1\r\n", path.c_str());
  ::send(sockfd, line, strlen(line), 0);
  snprintf(line, 256, "Host: %s:%d\r\n", host.c_str(), port);
  ::send(sockfd, line, strlen(line), 0);
  snprintf(line, 256, "Upgrade: websocket\r\n");
  ::send(sockfd, line, strlen(line), 0);
  snprintf(line, 256, "Connection: Upgrade\r\n");
  ::send(sockfd, line, strlen(line), 0);
  // TODO origin
  // if (!origin.empty()) {
  //   snprintf(line, 256, "Origin: %s\r\n", origin.c_str());
  //   ::send(sockfd, line, strlen(line), 0);
  // }
  snprintf(line, 256, "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==\r\n");
  ::send(sockfd, line, strlen(line), 0);
  snprintf(line, 256, "Sec-WebSocket-Version: 13\r\n");
  ::send(sockfd, line, strlen(line), 0);
  snprintf(line, 256, "\r\n");
  ::send(sockfd, line, strlen(line), 0);

  return check_header(sockfd);
}

int connect_from_hostname(const std::string& hostname, int port) {
  struct addrinfo hints;
  struct addrinfo* result;
  int ret;

  int sockfd = INVALID_SOCKET;

  memset(&hints, 0, sizeof(hints));
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;

  if ((ret = getaddrinfo(hostname.c_str(), std::to_string(port).c_str(), &hints,
                         &result)) != 0) {
    fprintf(stderr, "getaddrinfo: %s\n", gai_strerror(ret));
    return -2;
  }
  for (auto info = result; result != NULL; result = result->ai_next) {
    sockfd = socket(info->ai_family, info->ai_socktype, info->ai_protocol);

    if (sockfd == INVALID_SOCKET) continue;

    if (::connect(sockfd, info->ai_addr, info->ai_addrlen) == 0) {
      break;
    }
    ::close(sockfd);
    sockfd = INVALID_SOCKET;
  }
  freeaddrinfo(result);
  return sockfd;
}

int send(int sockfd, uint8_t* data, const std::string& message) {
  Protocol protocol;
  protocol.FIN = 1;
  protocol.opcode = Protocol::opcode_type::TEXT_FRAME;
  protocol.mask = 1;
  auto end = protocol.encode(message.begin(), message.end(), data);

  return ::send(sockfd, data, end - data, 0);
}

int recv_timeout(int sockfd, uint8_t* data, uint64_t size, int timeout) {
  fd_set rfds;
  FD_ZERO(&rfds);
  FD_SET(sockfd, &rfds);

  if (timeout > 0) {
    timeval tv = {timeout / 1000, (timeout % 1000) * 1000};
    ::select(sockfd + 1, &rfds, NULL, NULL, &tv);
  } else {
    ::select(sockfd + 1, &rfds, NULL, NULL, NULL);
  }

  if (FD_ISSET(sockfd, &rfds)) {
    return ::recv(sockfd, data, size, 0);
  }
  return -1;  // TODO: throw??
}

std::string recv(int sockfd, std::vector<uint8_t>& data, int timeout,
                 Protocol* p) {
  Protocol protocol;

  // Receive FIN, RSV1, RSV2, RSV3, opcode
  if (recv_timeout(sockfd, data.data(), 2, timeout) == -1) {
    throw - 1;
  }
  protocol.decode_header(data.data());

  // Receive mask, payload length
  if (recv_timeout(sockfd, data.data(), protocol.expandable_length(),
                   timeout) == -1) {
    throw - 1;
  }
  protocol.decode_expandables(data.data());

  if (data.size() < protocol.length) {
    data.resize(Protocol::MAX_FRAMING_HEADER_LEN + protocol.length);
  }

  // Receive payload
  if (recv_timeout(sockfd, data.data(), protocol.length, timeout) == -1) {
    return "";
  }
  std::string response(protocol.length, 0);
  protocol.decode_payload(data.data(), response.begin());

  if (p != nullptr) *p = protocol;

  return response;
}

void close(int s) { ::close(s); }

}  // namespace internal

void WebSocketApp::run_forever() {
  std::unique_ptr<WebSocket> ws(WebSocket::create_connection(url_));

  if (ws != nullptr) {
    on_open_(ws.get());
  }

  // TODO: create thread
  // TODO: try ~ catch
  try {
    while (ws->is_connected()) {
      internal::Protocol protocol;
      std::string msg = ws->recv(timeout_, &protocol);

      if (protocol.opcode == internal::Protocol::opcode_type::CLOSE) {
        ws->close();
      } else {
        on_message_(ws.get(), msg);
      }
    }
  }
  catch (int e) {
    // TODO: on_error
    std::cerr << "Error code: " << e << std::endl;
  }
  on_close_();  // TODO: message
}

}  // namespace websocket

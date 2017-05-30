#pragma once

#include <cstdint>
#include <iostream>

namespace websocket {

namespace internal {

/**
 * Decode byte sequence to 64bit integer.
 *
 * @pre sequence must have length larger than or equal to 8.
 */
template <class InputIterator>
inline uint64_t decode_uint64(InputIterator first) {
  uint64_t res = 0;
  int shift = 64;
  while (shift) {
    shift -= 8;
    res |= static_cast<uint64_t>(*first) << shift;
    ++first;
  }
  return res;
}

/**
 * Data transfer protocol based on RFC6455.
 *
 * 0                   1                   2                   3
 * 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-------+-+-------------+-------------------------------+
 * |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 * |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
 * |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 * | |1|2|3|       |K|             |                               |
 * +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 * |     Extended payload length continued, if payload len == 127  |
 * + - - - - - - - - - - - - - - - +-------------------------------+
 * |                               |Masking-key, if MASK set to 1  |
 * +-------------------------------+-------------------------------+
 * | Masking-key (continued)       |          Payload Data         |
 * +-------------------------------- - - - - - - - - - - - - - - - +
 * :                     Payload Data continued ...                :
 * + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
 * |                     Payload Data continued ...                |
 * +---------------------------------------------------------------+
 */
struct Protocol {
  static constexpr std::size_t MAX_FRAMING_HEADER_LEN = 14;

  bool FIN;
  bool RSV1;
  bool RSV2;
  bool RSV3;
  bool mask;

  enum opcode_type {
    CONTINUATION = 0x0,
    TEXT_FRAME = 0x1,
    BINARY_FRAME = 0x2,
    CLOSE = 0x8,
    PING = 0x9,
    PONG = 0xa,
  } opcode;
  uint8_t masking_key[4];  // TODO: use random
  uint8_t payload_len;     // 0~127
  uint64_t length;         // length of payload

  Protocol()
      : FIN(0),
        RSV1(0),
        RSV2(0),
        RSV3(0),
        mask(0),
        opcode(CONTINUATION),
        payload_len(0),
        length(0) {
    masking_key[0] = 0x12;
    masking_key[1] = 0x34;
    masking_key[2] = 0x56;
    masking_key[3] = 0x78;
  }

  template <class InputIterator>
  uint64_t size_expected(InputIterator first, InputIterator last) {
    uint64_t size = last - first;
    uint64_t res = 2;

    res += mask ? 4 : 0;
    res += size;
    if (126 <= size && size <= 0xff) {
      size += 2;
    } else if (0xff < size) {
      size += 8;
    }
    return size;
  }

  template <class OutputIterator, class InputIterator>
  OutputIterator encode(InputIterator first, InputIterator last,
                        OutputIterator result) const {
    *result = FIN << 7 | RSV1 << 6 | RSV2 << 5 | RSV3 << 4 | opcode;
    ++result;

    *result = mask << 7;

    const std::size_t size = last - first;
    if (size <= 125) {
      *result |= size;
      ++result;
    } else if (size <= 0xffff) {
      *result |= 126;
      ++result;
      *result = size >> 8;
      ++result;
      *result = size & 0xff;
      ++result;
    } else {
      *result |= 127;
      ++result;

      std::size_t shift = 64;
      while (shift) {
        shift -= 8;
        *result = size >> shift & 0xff;
        ++result;
      }
    }

    if (mask) {
      *result = masking_key[0];
      ++result;

      *result = masking_key[1];
      ++result;

      *result = masking_key[2];
      ++result;

      *result = masking_key[3];
      ++result;

      std::size_t count = 0;
      while (first != last) {
        *result = *first ^ masking_key[count & 0x3];
        ++first;
        ++result;
        count = (count + 1) & 0x03;
      }
    } else {
      while (first != last) {
        *result = *first;
        ++first;
        ++result;
      }
    }
    return result;
  }

  /**
   * Decode header part of data.
   */
  template <class InputIterator>
  InputIterator decode_header(InputIterator input) {
    FIN = *input >> 7 & 0x01;
    RSV1 = *input >> 6 & 0x01;
    RSV2 = *input >> 5 & 0x01;
    RSV3 = *input >> 4 & 0x01;
    opcode = static_cast<opcode_type>(*input & 0x0f);
    ++input;

    mask = *input & 0x80 ? 1 : 0;
    payload_len = *input & 0x7f;  // 7bit
    ++input;

    return input;
  }

  template <class InputIterator>
  InputIterator decode_expandables(InputIterator input) {
    if (payload_len <= 125) {
      length = payload_len;
    } else if (payload_len == 126) {
      length = *input << 8;
      ++input;
      length |= *input & 0xff;
      ++input;
    } else if (payload_len == 127) {
      length = decode_uint64(input);
    } else {
      // TODO: error
    }

    if (mask) {
      masking_key[0] = *input;
      ++input;
      masking_key[1] = *input;
      ++input;
      masking_key[2] = *input;
      ++input;
      masking_key[3] = *input;
      ++input;
    }
    return input;
  }

  /**
   * Decode payload data
   */
  template <class OutputIterator, class InputIterator>
  OutputIterator decode_payload(InputIterator input,
                                OutputIterator result) const {
    for (uint64_t i = 0; i < length; i++) {
      *result = mask ? *input ^ masking_key[i & 0x3] : *input;
      ++result;
      ++input;
    }
    return result;
  }

  /**
   * Decode header and payload
   *
   * TODO: test me
   */
  template <class OutputIterator, class InputIterator>
  OutputIterator decode(InputIterator input, OutputIterator result) {
    input = decode_header(input);
    input = decoded_expantables(input);
    return decode_payload(result);
  }

  /**
   * Length of expandable part: masking_key and length
   */
  uint32_t expandable_length() const {
    return mask ? 4 : 0 + payload_len == 126 ? 2 : payload_len == 127 ? 8 : 0;
  }
};

}  // namespace internal

}  // namespace websocket

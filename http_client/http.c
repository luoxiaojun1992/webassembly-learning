#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "./curl-7.54.0/include/curl/curl.h"

#define POSTURL    "http://www.qianshengqian.com/"
#define POSTFIELDS "email=myemail@163.com&password=mypassword&autologin=1&submit=登 录&type="
#define FILENAME   "curlposttest.log"
#define COOKIE_FILE "./curlposttest.cookie"

int httpPost() {
    CURL *curl;
    CURLcode res;
    FILE* fptr;
    struct curl_slist *http_header = NULL;

    if ((fptr = fopen(FILENAME,"w")) == NULL)
    {
        fprintf(stderr,"fopen file error:%s\n",FILENAME);
        return -1;
    }

    curl = curl_easy_init();
    if (!curl)
    {
        fprintf(stderr,"curl init failed\n");
        return -1;
    }

    curl_easy_setopt(curl,CURLOPT_URL,POSTURL); //url地址
    curl_easy_setopt(curl,CURLOPT_POSTFIELDS,POSTFIELDS); //post参数
    //curl_easy_setopt(curl,CURLOPT_WRITEFUNCTION,write_data); //对返回的数据进行操作的函数地址
    //curl_easy_setopt(curl,CURLOPT_WRITEDATA,fptr); //这是write_data的第四个参数值
    curl_easy_setopt(curl,CURLOPT_POST,1); //设置问非0表示本次操作为post
    curl_easy_setopt(curl,CURLOPT_VERBOSE,1); //打印调试信息
    curl_easy_setopt(curl,CURLOPT_HEADER,1); //将响应头信息和相应体一起传给write_data
    curl_easy_setopt(curl,CURLOPT_FOLLOWLOCATION,1); //设置为非0,响应头信息location
    curl_easy_setopt(curl,CURLOPT_COOKIEFILE,COOKIE_FILE);

    res = curl_easy_perform(curl);

    if (res != CURLE_OK)
    {
        switch(res)
        {
            case CURLE_UNSUPPORTED_PROTOCOL:
                fprintf(stderr,"不支持的协议,由URL的头部指定\n");
            case CURLE_COULDNT_CONNECT:
                fprintf(stderr,"不能连接到remote主机或者代理\n");
            case CURLE_HTTP_RETURNED_ERROR:
                fprintf(stderr,"http返回错误\n");
            case CURLE_READ_ERROR:
                fprintf(stderr,"读本地文件错误\n");
            default:
                fprintf(stderr,"返回值:%d\n",res);
        }
        return -1;
    }

    curl_easy_cleanup(curl);

    return 0;
}

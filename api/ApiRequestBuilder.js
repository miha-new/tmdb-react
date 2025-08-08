class ApiRequestBuilder {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.headers = {};
    this.params = {};
  }

  setHeader(key, value) {
    this.headers[key] = value;
    return this;
  }

  setParam(key, value) {
    this.params[key] = value;
    return this;
  }

  build(path) {
    const url = new URL(path, this.baseUrl);
    Object.entries(this.params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    return {
      url: url.toString(),
      headers: this.headers,
    };
  }
}

export default ApiRequestBuilder
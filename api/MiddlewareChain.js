class MiddlewareChain {
  constructor() {
    this.middlewares = [];
  }

  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(request) {
    let result = request;
    for (const middleware of this.middlewares) {
      result = await middleware(result);
      if (result instanceof Response) {
        return result;
      }
    }
    return result;
  }
}

export default MiddlewareChain
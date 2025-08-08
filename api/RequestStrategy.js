class RequestStrategy {
  constructor() {
    this.strategies = new Map();
  }

  setStrategy(method, strategy) {
    this.strategies.set(method, strategy);
    return this;
  }

  async execute(method, ...args) {
    const strategy = this.strategies.get(method);
    if (!strategy) {
      throw new Error(`No strategy for method: ${method}`);
    }
    return strategy(...args);
  }
}

export default RequestStrategy
// Stripe SDK stub for tests.
// Individual tests mock specific methods via jest.spyOn or jest.fn().
class Stripe {
  customers = {
    retrieve: jest.fn(),
  }
  paymentIntents = {
    retrieve: jest.fn(),
  }
  invoices = {
    retrieve: jest.fn(),
    all: jest.fn(),
  }
  refunds = {
    retrieve: jest.fn(),
  }
  subscriptions = {
    retrieve: jest.fn(),
  }
  apps = {
    secrets: {
      create: jest.fn(),
      find: jest.fn(),
      deleteWhere: jest.fn(),
    },
  }
}

export default Stripe

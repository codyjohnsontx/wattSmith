type MockAuth = {
  mockResolvedValue: (value: unknown) => void;
};

export function mockSignIn(mockAuth: MockAuth) {
  mockAuth.mockResolvedValue({
    user: {
      id: "user-1",
      name: null,
      email: null,
      image: null,
    },
  });
}

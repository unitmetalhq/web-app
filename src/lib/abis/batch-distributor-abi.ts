export const BatchDistributorAbi = [
  {
    inputs: [{ internalType: "uint256", name: "_fee", type: "uint256" }],
    stateMutability: "payable",
    type: "constructor",
  },
  {
    inputs: [{ internalType: "address", name: "emitter", type: "address" }],
    name: "EtherTransferFail",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "required", type: "uint256" },
      { internalType: "uint256", name: "provided", type: "uint256" },
    ],
    name: "InsufficientFee",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "OwnableInvalidOwner",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "OwnableUnauthorizedAccount",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "token", type: "address" }],
    name: "SafeERC20FailedOperation",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "oldFee",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "newFee",
        type: "uint256",
      },
    ],
    name: "FeeUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address payable",
                name: "recipient",
                type: "address",
              },
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            internalType: "struct BatchDistributor.Transaction[]",
            name: "txns",
            type: "tuple[]",
          },
        ],
        internalType: "struct BatchDistributor.Batch",
        name: "batch",
        type: "tuple",
      },
    ],
    name: "distributeEther",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract IERC721", name: "token", type: "address" },
      {
        components: [
          {
            components: [
              {
                internalType: "address payable",
                name: "recipient",
                type: "address",
              },
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            internalType: "struct BatchDistributor.Transaction[]",
            name: "txns",
            type: "tuple[]",
          },
        ],
        internalType: "struct BatchDistributor.Batch",
        name: "batch",
        type: "tuple",
      },
    ],
    name: "distributeNft",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract IERC20", name: "token", type: "address" },
      {
        components: [
          {
            components: [
              {
                internalType: "address payable",
                name: "recipient",
                type: "address",
              },
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            internalType: "struct BatchDistributor.Transaction[]",
            name: "txns",
            type: "tuple[]",
          },
        ],
        internalType: "struct BatchDistributor.Batch",
        name: "batch",
        type: "tuple",
      },
    ],
    name: "distributeToken",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "fee",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "newFee", type: "uint256" }],
    name: "setFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

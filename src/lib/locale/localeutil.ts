class TrieNode {
  public children: Map<string, TrieNode>;
  public isEndOfWord: boolean;
  public count: number;

  constructor() {
    this.children = new Map();
    this.isEndOfWord = false;
    this.count = 0;
  }
}

function insertWord(root: TrieNode, word: string) {
  let currentNode: TrieNode | undefined = root;

  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    if (!currentNode?.children.has(char)) {
      currentNode?.children.set(char, new TrieNode());
    }
    currentNode = currentNode?.children.get(char);
    if (currentNode) {
      currentNode.count++;
    }
  }
  if (currentNode) {
    currentNode.isEndOfWord = true;
  }
}

export function shortestUniquePrefixes(words: string[]) {
  const root = new TrieNode();
  const prefixes: string[] = [];

  for (const word of words) {
    insertWord(root, word);
  }

  for (const word of words) {
    let currentNode: TrieNode | undefined = root;
    let prefix = "";

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      prefix += char;
      currentNode = currentNode?.children.get(char);

      if (currentNode && currentNode.count === 1) {
        prefixes.push(prefix);
        break;
      }
    }
  }

  return prefixes;
}

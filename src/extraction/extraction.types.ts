export interface ExtractedPerson {
  name: string;
  relationship?: string;
  facts: string[];
}

export interface ExtractionResult {
  people: ExtractedPerson[];
  topics: string[];
  emotionalTone: string;
  keyFacts: string[];
}

export interface ExtractionState {
  userId: string;
  messageId: string;
  content: string;
  extracted?: ExtractionResult;
  stored?: boolean;
  error?: string;
}

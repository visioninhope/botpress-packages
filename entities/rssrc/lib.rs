use wasm_bindgen::prelude::*;

mod lodash;
mod scores;
mod strings;
mod tokens;

extern crate console_error_panic_hook;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn jaro_winkler_sim(a: String, b: String) -> f64 {
    init();
    strings::jaro_winkler_similarity(&a, &b, None)
}

#[wasm_bindgen]
pub fn levenshtein_sim(a: String, b: String) -> f64 {
    init();
    strings::levenshtein_similarity(&a, &b)
}

#[wasm_bindgen]
pub fn levenshtein_dist(a: String, b: String) -> usize {
    init();
    strings::levenshtein_distance(&a, &b)
}

// ####################
// ###              ###
// ### IO / Typings ###
// ###              ###
// ####################

#[derive(Clone)]
#[wasm_bindgen]
pub struct SynonymDefinition {
    tokens: StringArray,
}
#[wasm_bindgen]
impl SynonymDefinition {
    #[wasm_bindgen(constructor)]
    pub fn new(tokens: StringArray) -> Self {
        Self { tokens }
    }
}

#[derive(Clone)]
#[wasm_bindgen]
pub struct ValueDefinition {
    name: String,
    synonyms: SynonymArray,
}
#[wasm_bindgen]
impl ValueDefinition {
    #[wasm_bindgen(constructor)]
    pub fn new(name: String, synonyms: SynonymArray) -> Self {
        Self { name, synonyms }
    }
}

#[derive(Clone)]
#[wasm_bindgen]
pub struct EntityDefinition {
    name: String,
    fuzzy: f64,
    values: ValueArray,
}
#[wasm_bindgen]
impl EntityDefinition {
    #[wasm_bindgen(constructor)]
    pub fn new(name: String, fuzzy: f64, values: ValueArray) -> Self {
        Self {
            name,
            fuzzy,
            values,
        }
    }
}

#[derive(Clone)]
#[wasm_bindgen]
pub struct EntityExtraction {
    name: String,
    pub confidence: f64,
    pub char_start: usize,
    pub char_end: usize,
    value: String,
    source: String,
}
#[wasm_bindgen]
impl EntityExtraction {
    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        self.name.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn value(&self) -> String {
        self.value.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn source(&self) -> String {
        self.source.clone()
    }
}

#[derive(Clone)]
#[wasm_bindgen]
pub struct StringArray(Vec<String>);
#[wasm_bindgen]
impl StringArray {
    #[wasm_bindgen(constructor)]
    pub fn new() -> StringArray {
        StringArray(Vec::new())
    }

    #[wasm_bindgen]
    pub fn push(&mut self, s: String) {
        self.0.push(s);
    }
}

#[derive(Clone)]
#[wasm_bindgen]
pub struct SynonymArray(Vec<SynonymDefinition>);
#[wasm_bindgen]
impl SynonymArray {
    #[wasm_bindgen(constructor)]
    pub fn new() -> SynonymArray {
        SynonymArray(Vec::new())
    }

    #[wasm_bindgen]
    pub fn push(&mut self, s: SynonymDefinition) {
        self.0.push(s);
    }
}

#[derive(Clone)]
#[wasm_bindgen]
pub struct ValueArray(Vec<ValueDefinition>);
#[wasm_bindgen]
impl ValueArray {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ValueArray {
        ValueArray(Vec::new())
    }

    #[wasm_bindgen]
    pub fn push(&mut self, s: ValueDefinition) {
        self.0.push(s);
    }
}

#[wasm_bindgen]
pub struct ExtractionArray(Vec<EntityExtraction>);
#[wasm_bindgen]
impl ExtractionArray {
    fn from(x: Vec<EntityExtraction>) -> Self {
        Self(x)
    }
    #[wasm_bindgen]
    pub fn get(&self, idx: usize) -> EntityExtraction {
        self.0.get(idx).unwrap().clone()
    }
    #[wasm_bindgen]
    pub fn len(&self) -> usize {
        self.0.len()
    }
}

// ######################
// ###                ###
// ### Implementation ###
// ###                ###
// ######################

const ENTITY_SCORE_THRESHOLD: f64 = 0.6;

#[derive(Debug, Clone)]
struct Candidate {
    struct_score: f64,
    length_score: f64, // structural score adjusted by the length of the synonym to favor longer matches
    token_start: usize,
    token_end: usize,
    name: String,   // fruit
    value: String,  // Watermelon
    source: String, // water-meln
}

#[derive(Debug, Clone)]
struct FlatSynonym {
    name: String,
    fuzzy: f64,
    value: String,
    tokens: Vec<String>,
    max_synonym_len: usize,
}

fn extract_for_synonym(tokens: &[tokens::Token], synonym: &FlatSynonym) -> Vec<Candidate> {
    let mut candidates: Vec<Candidate> = Vec::new();
    let synonym_str = synonym.tokens.join("");

    for token_idx in 0..tokens.len() {
        if tokens[token_idx].is_space {
            continue;
        }

        let workset: Vec<String> = tokens::take_until(tokens, token_idx, synonym_str.len())
            .iter()
            .map(|x| x.value.clone())
            .collect();

        let source = workset.join("");

        let is_fuzzy = synonym.fuzzy < 1.0 && source.len() >= 4;

        let exact_score = scores::compute_exact_score(&workset, &synonym.tokens);
        let exact_factor = if exact_score == 1.0 { 1.0 } else { 0.0 };

        let fuzzy_score = scores::compute_fuzzy_score(
            &workset
                .iter()
                .map(|x| x.to_lowercase())
                .collect::<Vec<String>>(),
            &synonym
                .tokens
                .iter()
                .map(|x| x.to_lowercase())
                .collect::<Vec<String>>(),
        );
        let fuzzy_factor = if fuzzy_score >= synonym.fuzzy {
            fuzzy_score
        } else {
            0.0
        };

        let used_factor = if is_fuzzy { fuzzy_factor } else { exact_factor };
        let struct_score =
            used_factor * scores::compute_structural_score(&workset, &synonym.tokens);

        let used_length = source.len().min(synonym.max_synonym_len);
        let length_score = struct_score * (used_length as f64).powf(0.2);

        candidates.push(Candidate {
            struct_score,
            length_score,
            name: synonym.name.clone(),
            value: synonym.value.clone(),
            token_start: token_idx,
            token_end: token_idx + workset.len() - 1,
            source,
        });
    }

    candidates
}

fn flatten_synonyms(list_model: EntityDefinition) -> Vec<FlatSynonym> {
    let mut flattened: Vec<FlatSynonym> = vec![];

    for value in list_model.values.0 {
        let max_synonym_len: usize = value
            .synonyms
            .0
            .iter()
            .map(|s| s.tokens.0.join("").len())
            .max()
            .unwrap_or(0);

        for synonym in value.synonyms.0 {
            flattened.push(FlatSynonym {
                name: list_model.name.clone(),
                fuzzy: list_model.fuzzy,
                value: value.name.clone(),
                tokens: synonym.tokens.0.clone(),
                max_synonym_len: max_synonym_len,
            });
        }
    }

    flattened
}

#[wasm_bindgen]
pub fn extract(str_tokens: StringArray, list_model: EntityDefinition) -> ExtractionArray {
    let utt_tokens = tokens::to_tokens(&str_tokens.0);

    let synonyms: Vec<FlatSynonym> = flatten_synonyms(list_model);

    // A) extract all candidates

    let mut candidates: Vec<Candidate> = Vec::new();
    for synonym in &synonyms {
        let new_candidates = extract_for_synonym(&utt_tokens, synonym);
        candidates.extend(new_candidates);
    }

    // B) eliminate overlapping candidates

    let mut eliminated: Vec<bool> = vec![false; candidates.len()];

    for token_idx in 0..utt_tokens.len() {
        let token_candidates: Vec<(usize, &Candidate)> = candidates
            .iter()
            .enumerate()
            .filter(|(_, c)| c.token_start <= token_idx && c.token_end >= token_idx)
            .collect();

        let mut active_token_candidates: Vec<&(usize, &Candidate)> = token_candidates
            .iter()
            .filter(|(i, _)| !eliminated[*i])
            .collect();

        // we use length adjusted score to favor longer matches
        lodash::sort_by(
            &mut active_token_candidates,
            |(_, c)| c.length_score,
            lodash::SortOrder::Descending,
        );

        if active_token_candidates.len() <= 1 {
            continue;
        }

        let losers = &active_token_candidates[1..];
        for (loser_idx, _) in losers {
            eliminated[*loser_idx] = true;
        }
    }

    let winners: Vec<&Candidate> = candidates
        .iter()
        .enumerate()
        .filter(|(i, _)| !eliminated[*i])
        .map(|(_, c)| c)
        .collect();

    // C) from winners keep only matches with high enough structural score
    let matches: Vec<&Candidate> = winners
        .iter()
        .filter(|x| x.struct_score >= ENTITY_SCORE_THRESHOLD)
        .cloned()
        .collect();

    // D) map to results
    let results: Vec<EntityExtraction> = matches
        .iter()
        .map(|match_| EntityExtraction {
            name: match_.name.clone(),
            confidence: match_.struct_score,
            char_start: utt_tokens[match_.token_start].char_start,
            char_end: utt_tokens[match_.token_end].char_end,
            value: match_.value.clone(),
            source: match_.source.clone(),
        })
        .collect();

    ExtractionArray::from(results)
}

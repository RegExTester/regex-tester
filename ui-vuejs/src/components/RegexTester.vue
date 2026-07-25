<template>
  <div class="card panel-primary-v3">
    <!-- Header -->
    <div class="card-header small-padding">
      <div class="row">
        <div class="col-6">
          <a class="text-white" href="/"><h3>RegEx Tester</h3></a>
        </div>
        <div class="col p-0">
          <div class="engine-info" :data-tooltip="engineTooltip">
            <i class="btn btn-icon btn-engine-info fa pull-right" aria-hidden="true"
               :class="engineIconClass"
               :style="engine === 'offline' ? 'color: #ff6b6b' : engine !== '' ? 'color: #69db7c' : ''"></i>
          </div>
          <div class="dropdown pull-right">
            <button class="btn btn-sm btn-outline-light dropdown-toggle" type="button"
              data-bs-toggle="dropdown" aria-expanded="false">
              {{ CONFIG.ENGINES[selectedEngine].Name }}
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li v-for="eng in CONFIG.ENGINES" :key="eng.Key">
                <button type="button" class="dropdown-item"
                  :class="{ active: selectedEngine === eng.Key }"
                  @click="selectedEngine = eng.Key; onEngineChange()">
                  {{ eng.Name }}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div class="card-body">
      <div class="row">
        <!-- Inputs: Pattern + Text -->
        <div class="col-md-9">
          <div class="form-group">
            <h6>Pattern</h6>
            <div>
              <textarea v-model="pattern" @input="delaySubmit()"
                rows="3" autocorrect="off" autocapitalize="none" spellcheck="false"
                :maxlength="limits.patternMaxLength"
                class="form-control input-text pattern" placeholder="\w+">
              </textarea>
              <span class="error-message" :class="{ hidden: !result.error }">{{ result.error || '' }}</span>
            </div>
          </div>
          <div class="form-group">
            <h6>Text</h6>
            <div style="position: relative;">
              <div class="loading center center-text-textarea" :class="{ hidden: !busy }"></div>
              <textarea v-model="text" @input="delaySubmit()"
                rows="5" autocorrect="off" autocapitalize="none" spellcheck="false"
                :maxlength="limits.textMaxLength"
                class="form-control input-text text" :class="{ readonly: busy }"
                placeholder="Input some text here">
              </textarea>
            </div>
          </div>
        </div>

        <!-- Options sidebar (desktop) -->
        <div class="col-md-3 d-md-block d-none">
          <h6>Options
            <a v-if="docsUrl" title="Regular expression options"
               :href="docsUrl"
               class="external-link" target="_blank" rel="noopener noreferrer">
              <i class="fa fa-external-link" aria-hidden="true"></i>
            </a>
          </h6>
          <div class="form-check" v-for="option in options" :key="option.value">
            <label class="form-check-label" :title="option.description">
              <input type="checkbox" class="form-check-input"
                v-model="option.checked" @change="delaySubmit()">
              {{ option.name }}
            </label>
          </div>
        </div>
      </div>

      <!-- Results tabs -->
      <div class="row">
        <div class="col">
          <div class="card nav-card">
            <div class="card-header">
              <ul class="nav nav-tabs card-header-tabs" role="tablist">
                <li class="nav-item" role="presentation">
                  <button type="button" class="nav-link" :class="{ active: activeTab === 'matches' }"
                    @click="activeTab = 'matches'" role="tab">
                    <h6>Matches</h6>
                  </button>
                </li>
                <li class="nav-item">
                  <button type="button" class="nav-link" :class="{ active: activeTab === 'replace' }"
                    @click="activeTab = 'replace'; delaySubmit()" role="tab">
                    <h6>Replace</h6>
                  </button>
                </li>
              </ul>
            </div>

            <div class="card-body">
              <!-- Matches tab -->
              <div v-show="activeTab === 'matches'" role="tabpanel">
                <h4 v-if="hasResult()">Result</h4>
                <div class="card hightlightText" v-if="hasResult()" v-html="highlightText"></div>

                <h4 v-if="hasResult()">Groups</h4>
                <div class="card match-result" v-for="(match, i) in result.matches" :key="i">
                  <div class="card-header" @click="toggleMatch(i)">
                    <span class="result-value" :class="'match-' + (i % CONFIG.MATCH_COLORS_COUNT)">{{ match.value }}</span>
                    <small><em>Index: {{ match.index }}, Length: {{ match.length }}</em></small>
                  </div>
                  <div class="card-body" v-if="expandMatchResult[i]">
                    <div class="p-1">
                      <h6>Groups</h6>
                      <ul class="list-group small">
                        <li class="list-group-item header">
                          <div class="row">
                            <div class="col">Name</div>
                            <div class="col">Value</div>
                            <div class="col">Index</div>
                            <div class="col">Length</div>
                          </div>
                        </li>
                        <li class="list-group-item" v-for="(group, gi) in match.groups" :key="gi">
                          <div class="row">
                            <div class="col">{{ group.name }}</div>
                            <div class="col">{{ group.value }}</div>
                            <div class="col">{{ group.index }}</div>
                            <div class="col">{{ group.length }}</div>
                          </div>
                        </li>
                      </ul>
                    </div>
                    <div class="p-1" v-if="match.captures">
                      <h6>Captures</h6>
                      <ul class="list-group small">
                        <li class="list-group-item header">
                          <div class="row">
                            <div class="col"></div>
                            <div class="col">Value</div>
                            <div class="col">Index</div>
                            <div class="col">Length</div>
                          </div>
                        </li>
                        <li class="list-group-item" v-for="(capture, ci) in match.captures" :key="ci">
                          <div class="row">
                            <div class="col"></div>
                            <div class="col">{{ capture.value }}</div>
                            <div class="col">{{ capture.index }}</div>
                            <div class="col">{{ capture.length }}</div>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Replace tab -->
              <div v-show="activeTab === 'replace'" role="tabpanel">
                <div class="form-group">
                  <label>Replace To</label>
                  <input v-model="replace" @input="delaySubmit()" type="text"
                    placeholder="Input some text here" class="form-control input-text"
                    autocorrect="off" autocapitalize="none" spellcheck="false" />
                </div>
                <div class="form-group">
                  <label>Result</label>
                  <textarea :value="result.replace || ''" readonly
                    rows="5" autocorrect="off" autocapitalize="none" spellcheck="false"
                    class="form-control input-text readonly">
                  </textarea>
                </div>
              </div>
            </div>

            <div class="card-footer bg-transparent"></div>
          </div>
        </div>
      </div>

      <!-- Options (mobile) -->
      <div class="row d-block d-md-none">
        <div class="col">
          <h6>Options</h6>
          <div class="form-check" v-for="option in options" :key="'m-' + option.value">
            <label class="form-check-label" :title="option.description">
              <input type="checkbox" class="form-check-input"
                v-model="option.checked" @change="delaySubmit(500)">
              {{ option.name }}
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="card-footer page-footer">
      <a href="https://leevox.com" target="_blank">LeeVox</a><span> &copy; 2017</span>
      <a target="_blank" href="https://github.com/RegExTester/" title="Source Code">
        <img width="32px" height="32px" src="/assets/img/github.png" />
      </a>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CONFIG } from '../config.js'
import { encodeBase64, decodeBase64 } from '../utils/encodeUriHelper.js'

const route  = useRoute()
const router = useRouter()

// State
const selectedEngine  = ref('DOTNET')
const engine          = ref('')
const pattern         = ref('')
const text            = ref('')
const replace         = ref('')
const highlightText   = ref('')
const busy            = ref(false)
const activeTab       = ref('matches')
const result          = ref({})
const expandMatchResult = ref({})
const limits          = ref({ patternMaxLength: 512, textMaxLength: 1024, replaceMaxLength: 1024 })

function engineConfig(engineKey) {
  return CONFIG.ENGINES[engineKey ?? selectedEngine.value]
}

const options = ref([])

// Bits from the last-known bitmask that belong to options the current engine does not expose.
// Recomputed from scratch on every rebuild -- never accumulated across engine switches -- so a
// bit stays parked here only while its owning option is hidden, and rejoins the rendered
// checkboxes the moment an engine that supports it is selected again.
let carriedBits = 0

function currentBitmask() {
  return options.value.reduce((sum, opt) => sum + (opt.checked ? opt.value : 0), 0) | carriedBits
}

function computeCarriedBits(bitmask, renderedOptions) {
  const exposedMask = renderedOptions.reduce((mask, opt) => mask | opt.value, 0)
  return bitmask & ~exposedMask
}

// Bundled fallback: only the flags this engine's config file lists as supported.
function rebuildOptions(engineKey, bitmask) {
  const src = engineConfig(engineKey).REGEX_OPTIONS
  options.value = Object.values(src).map(opt => ({
    name: opt.Name, value: opt.Value, description: null,
    checked: (bitmask & opt.Value) === opt.Value
  }))
  carriedBits = computeCarriedBits(bitmask, options.value)
}

// Live /api/capabilities: render only options this engine supports; bits belonging to
// unsupported options are preserved in carriedBits instead of being dropped.
function rebuildOptionsFromCapabilities(capsOptions, bitmask) {
  options.value = (capsOptions || [])
    .filter(opt => opt.supported === true)
    .map(opt => ({
      name: opt.name, value: opt.value, description: opt.description || null,
      checked: (bitmask & opt.value) === opt.value
    }))
  carriedBits = computeCarriedBits(bitmask, options.value)
}

let debounceTimer = null
let pendingBitmask = 0
let seedFromDefaults = false

// Computed helpers
const docsUrl = computed(() => engineConfig()?.DOCS_URL ?? null)
const engineTooltip = computed(() =>
  engine.value === '' ? 'Loading...' : engine.value === 'offline' ? 'Offline' : engine.value
)
const engineIconClass = computed(() =>
  engine.value === ''        ? 'fa-spinner fa-pulse'      :
  engine.value === 'offline' ? 'fa-exclamation-circle'    :
                               'fa-info-circle'
)

function hasResult() {
  return result.value.matches && result.value.matches.length > 0
}

function toggleMatch(i) {
  expandMatchResult.value = { ...expandMatchResult.value, [i]: !expandMatchResult.value[i] }
}

function apiConfig() {
  return engineConfig().API
}

const capabilitiesCache = {}
const CAPABILITIES_CACHE_TTL = 10 * 60 * 1000 // 10 minutes
const CAPABILITIES_FETCH_TIMEOUT = 5000 // ms; guards against a stalled/offline backend hanging forever

function fetchWithTimeout(url, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

function fetchCapabilities(engineKey) {
  const cached = capabilitiesCache[engineKey]
  if (cached && Date.now() - cached.at < CAPABILITIES_CACHE_TTL) {
    return Promise.resolve(cached.value)
  }
  return fetchWithTimeout(engineConfig(engineKey).API.CAPABILITIES, CAPABILITIES_FETCH_TIMEOUT)
    .then(r => {
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    })
    .then(data => {
      capabilitiesCache[engineKey] = { value: data, at: Date.now() }
      return data
    })
}

// Applies a live /api/capabilities response: rebuilds the option list (preserving whatever
// bitmask was in effect before the fetch), the pattern/text length limits, and the engine
// tooltip. Never called when the fetch failed -- callers fall back to the bundled config and
// an 'offline' tooltip silently in that case.
function applyCapabilities(engineKey, caps) {
  if (selectedEngine.value !== engineKey) return // stale response from a since-abandoned switch

  const bitmask = seedFromDefaults ? (caps.defaultOptions ?? engineConfig(engineKey).DEFAULT_OPTIONS ?? 0) : pendingBitmask
  seedFromDefaults = false
  rebuildOptionsFromCapabilities(caps.options, bitmask)

  limits.value = {
    patternMaxLength: caps.limits?.patternMaxLength ?? 512,
    textMaxLength:    caps.limits?.textMaxLength ?? 1024,
    replaceMaxLength: caps.limits?.replaceMaxLength ?? 1024,
  }

  engine.value = caps.runtime?.framework || 'online'
}

function warmUpApiServer() {
  const key = selectedEngine.value
  engine.value = ''

  fetchCapabilities(key)
    .then(caps => applyCapabilities(key, caps))
    .catch(() => { engine.value = 'offline' /* keep the bundled fallback option list already rendered */ })
}

function onEngineChange() {
  seedFromDefaults = false
  pendingBitmask = currentBitmask()
  rebuildOptions(selectedEngine.value, pendingBitmask) // immediate bundled render; preserves the bitmask
  warmUpApiServer()
  delaySubmit()
}

function delaySubmit(time) {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => submit(), time ?? CONFIG.DELAY_TIME)
}

function submit() {
  if (!pattern.value || !text.value) return

  if (pattern.value.length > limits.value.patternMaxLength) {
    result.value = { error: `Pattern exceeds maximum length of ${limits.value.patternMaxLength} characters.` }
    return
  }
  if (text.value.length > limits.value.textMaxLength) {
    result.value = { error: `Text exceeds maximum length of ${limits.value.textMaxLength} characters.` }
    return
  }

  busy.value = true
  result.value = {}
  expandMatchResult.value = {}
  highlightText.value = ''

  const encodedPattern  = encodeBase64(pattern.value)
  const encodedText     = encodeBase64(text.value)
  const optionsBitmask  = currentBitmask()
  const engineIndex     = CONFIG.ENGINES[selectedEngine.value].Index
  const url = `/${encodedPattern}/${encodedText}/${optionsBitmask}/${engineIndex}`

  updateUrl(url)

  fetch(apiConfig().REGEX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pattern: pattern.value,
      text:    text.value,
      replace: activeTab.value === 'replace' ? replace.value : null,
      options: optionsBitmask
    })
  })
    .then(r => r.json().then(data => ({ ok: r.ok, status: r.status, data })))
    .then(({ ok, status, data }) => {
      if (!ok) {
        result.value = { error: formatApiError(status, data) }
        busy.value = false
        return
      }
      result.value = data
      let ht = text.value
      for (let i = data.matches.length - 1; i >= 0; i--) {
        const m = data.matches[i]
        ht = ht.substring(0, m.index)
          + `<span class="result-value-small match-${i % CONFIG.MATCH_COLORS_COUNT}">${m.value}</span>`
          + ht.substring(m.index + m.length)
      }
      highlightText.value = ht
      busy.value = false
    })
    .catch(() => {
      result.value = { error: 'Error: Cannot contact the API.' }
      busy.value = false
    })
}

function updateUrl(url) {
  router.replace(url)
  document.title = `RegEx Tester (${CONFIG.ENGINES[selectedEngine.value].Name}) ||| ${pattern.value} ||| ${text.value}`
  const ogDesc = document.querySelector('meta[property="og:description"]')
  const ogUrl  = document.querySelector('meta[property="og:url"]')
  if (ogDesc) ogDesc.setAttribute('content', 'Pattern: ' + pattern.value)
  if (ogUrl)  ogUrl.setAttribute('content', url)
}

function engineKeyByIndex(index) {
  const entry = Object.values(CONFIG.ENGINES).find(e => e.Index === index)
  return entry ? entry.Key : CONFIG.DEFAULT_ENGINE
}

// Renders a 400/413 ProblemDetails body as a single readable string. Values here are
// interpolated as text ({{ result.error }}) rather than v-html, so no HTML injection risk
// even though these strings originate from the API response.
function formatApiError(status, problem) {
  if (status === 413) {
    return problem?.title || 'Request too large.'
  }
  if (problem?.errors) {
    return Object.values(problem.errors).flat().join(' ')
  }
  return problem?.title || `Request failed (HTTP ${status}).`
}

function initFromRoute() {
  const params      = route.params
  const engineParam = isNaN(+params.engine) ? 0 : +params.engine

  selectedEngine.value = engineKeyByIndex(engineParam)

  const hasExplicitOptions = !isNaN(+params.options)
  const defaultOpts  = engineConfig(selectedEngine.value).DEFAULT_OPTIONS ?? 0
  const optionsValue = hasExplicitOptions ? +params.options : defaultOpts

  pattern.value = decodeBase64(params.pattern || '')
  text.value    = decodeBase64(params.text    || '')

  // Only seed from the engine's defaults when the URL has no explicit bitmask (first load).
  // A later engine switch always preserves whatever bitmask is currently in effect.
  seedFromDefaults = !hasExplicitOptions
  pendingBitmask = optionsValue
  rebuildOptions(selectedEngine.value, optionsValue)

  submit()
}

onMounted(() => {
  initFromRoute()
  warmUpApiServer()
})
</script>

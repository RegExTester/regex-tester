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
               :class="engineIconClass"></i>
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
                maxlength="512"
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
                maxlength="1024"
                class="form-control input-text text" :class="{ readonly: busy }"
                placeholder="Input some text here">
              </textarea>
            </div>
          </div>
        </div>

        <!-- Options sidebar (desktop) -->
        <div class="col-md-3 d-md-block d-none">
          <h6>Options
            <a title="Regular expression options"
               href="https://learn.microsoft.com/en-us/dotnet/standard/base-types/regular-expression-options"
               class="external-link" target="_blank">
              <i class="fa fa-external-link" aria-hidden="true"></i>
            </a>
          </h6>
          <div class="form-check" v-for="option in options" :key="option.value">
            <label class="form-check-label">
              <input type="checkbox" class="form-check-input"
                v-model="option.checked" @change="delaySubmit()"> {{ option.name }}
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
            <label class="form-check-label">
              <input type="checkbox" class="form-check-input"
                v-model="option.checked" @change="delaySubmit(500)"> {{ option.name }}
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

const options = reactive(
  Object.values(CONFIG.REGEX_OPTIONS).map(opt => ({
    name: opt.Name, value: opt.Value, checked: false
  }))
)

let debounceTimer = null

// Computed helpers
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
  return CONFIG.API[selectedEngine.value]
}

function warmUpApiServer() {
  engine.value = ''
  fetch(apiConfig().INFO)
    .then(r => r.json())
    .then(data => { engine.value = data.frameworkDescription || data.framework })
    .catch(() => { engine.value = 'offline' })
}

function onEngineChange() {
  warmUpApiServer()
  delaySubmit()
}

function delaySubmit(time) {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => submit(), time ?? CONFIG.DELAY_TIME)
}

function submit() {
  if (!pattern.value || !text.value) return

  if (pattern.value.length > 512) {
    result.value = { error: 'Pattern exceeds maximum length of 512 characters.' }
    return
  }
  if (text.value.length > 1024) {
    result.value = { error: 'Text exceeds maximum length of 1024 characters.' }
    return
  }

  busy.value = true
  result.value = {}
  expandMatchResult.value = {}
  highlightText.value = ''

  const encodedPattern  = encodeBase64(pattern.value)
  const encodedText     = encodeBase64(text.value)
  const optionsBitmask  = options.reduce((sum, opt) => sum + (opt.checked ? opt.value : 0), 0)
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
    .then(r => r.json())
    .then(data => {
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

function initFromRoute() {
  const params       = route.params
  const optionsValue = isNaN(+params.options) ? CONFIG.DEFAULT_OPTIONS : +params.options
  const engineParam  = isNaN(+params.engine) ? 0 : +params.engine

  pattern.value       = decodeBase64(params.pattern || '')
  text.value          = decodeBase64(params.text    || '')
  selectedEngine.value = engineKeyByIndex(engineParam)
  options.forEach(opt => {
    opt.checked = (optionsValue & opt.value) === opt.value
  })

  submit()
}

onMounted(() => {
  initFromRoute()
  warmUpApiServer()
})
</script>

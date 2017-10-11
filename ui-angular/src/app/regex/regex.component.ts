import {Component, OnInit, OnDestroy, ElementRef, ViewChild} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Meta } from '@angular/platform-browser';
import { HighlightTag } from 'angular-text-input-highlight';
import { RegExTesterResult, Match } from '../../model/regextesterresult.model';
import { EncodeUriHelper } from '../../utils/encodeUriHelper';
import { GtagHelper } from '../../utils/googleAnalyticsHelper';
import { CONFIG } from './regex.config';

@Component({
  selector: 'app-regex',
  templateUrl: './regex.component.html',
  styleUrls: ['./regex.component.css'],
  providers: [ EncodeUriHelper, GtagHelper ]
})
export class RegexComponent implements OnInit, OnDestroy {
  @ViewChild('tabReplace') tabReplace: ElementRef;

  routeSubscribe;
  debounceTimer;
  busy = false;

  pattern = '';
  text = '';
  replace = '';
  options = Object.values(CONFIG.REGEX_OPTIONS).map(opt => ({
    name: opt.Name, value: opt.Value, checked: false
  }));

  result: any = {};
  resultTable: any = [];
  highlight: HighlightTag[] = [];

  constructor(private http: HttpClient,
    private meta: Meta,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private encoder: EncodeUriHelper,
    private gtag: GtagHelper) {
  }

  ngOnInit() {
    this.warmUpApiServer();

    this.routeSubscribe = this.route.params.subscribe(params => {
      const optionsValue = +params['options'];

      this.pattern = this.encoder.decodeBase64(params['pattern'] || '');
      this.text = this.encoder.decodeBase64(params['text'] || '');
      this.options.forEach(opt => {
        opt.checked = (optionsValue & opt.value) === opt.value;
      });

      this.submit();
    });
  }

  ngOnDestroy() {
    this.routeSubscribe.unsubscribe();
  }

  warmUpApiServer() {
    this.http.get<any>(CONFIG.API.DOTNET.INFO).subscribe(data => {
      console.log('Engine: ' + data.framework);
    });
  }

  /** debounce user input */
  delaySubmit(time?: number) {
    this.highlight = [];

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
        this.submit();
    }, time || CONFIG.DELAY_TIME);
  }

  submit() {
    if (!this.pattern || !this.text) {
      return;
    }

    this.busy = true;
    this.result = {};
    this.highlight = [];

    const pattern = this.encoder.encodeBase64(this.pattern || ''),
      text = this.encoder.encodeBase64(this.text || ''),
      options = this.options.reduce((sum, option) => sum + (option.checked ? option.value : 0), 0),
      url = '/{pattern}/{text}/{options}'.replace('{pattern}', pattern).replace('{text}', text).replace('{options}', options.toString());

    this.updateUrl(url, {
      event: 'regex',
      category: this.pattern,
      action: this.text,
      label: options.toString(),

      facebook: {

      }
    });

    this.http.post<RegExTesterResult>(CONFIG.API.DOTNET.REGEX, {
      pattern: this.pattern,
      text: this.text,
      replace: this.tabReplace.nativeElement.classList.contains('active') ? this.replace : null,
      options: options
    }).subscribe(data  => {
      this.result = data;
      this.flatternResult();

      setTimeout(() => {
        let matchIndex = 0;
        this.highlight = data.matches.map(match => ({
          cssClass: 'match-' + (matchIndex++ % CONFIG.MATCH_COLORS_COUNT),
          indices: {start: match.index, end: match.index + match.length}
        }));
        this.busy = false;
      }, CONFIG.DELAY_TIME);
    });
  }

  flatternResult() {
    const matches = this.result.matches;
    let match, group, table = [];

    for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
      match = matches[matchIndex];
      for (let groupIndex = 0; groupIndex < match.groups.length; groupIndex++) {
        group = match.groups[groupIndex];

        table.push({
          match: groupIndex > 0 ? undefined : {
            name: match.name,
            index: match.index,
            length: match.length,
            value: match.value,
            class: 'match-' + (matchIndex % CONFIG.MATCH_COLORS_COUNT),
            rowspan: match.groups.length,
          },
          group: {
            name: group.name,
            index: group.index,
            length: group.length,
            value: group.value
          }
        });
      }
    }

    this.resultTable = table;
  }

  updateUrl(url: string, seo: any) {
    this.location.replaceState(url);
    this.gtag.updatePath(url);
    this.gtag.trackEvent(seo.event, seo.category, seo.action, seo.label);

    this.meta.updateTag({name: 'og:url', content: url});
    this.meta.updateTag({name: 'og:description', content: 'Pattern: ' + this.pattern});
  }
}

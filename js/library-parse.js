/* 拾页 · 书文件解析：EPUB / PDF / TXT / MD 导入 */
(function () {
  'use strict';

  // ---------- 脚本路径推导（用于定位 vendor/ 目录） ----------
  var _baseDir = (function () {
    try {
      var cs = document.currentScript;
      if (cs && cs.src) return new URL('.', cs.src).href;
    } catch (e) { /* ignore */ }
    try {
      return new URL('.', document.baseURI || location.href).href;
    } catch (e) { /* ignore */ }
    return '';
  })();

  var _vendorDir = (function () {
    if (_baseDir) {
      try { return new URL('../vendor/', _baseDir).href; } catch (e) { /* ignore */ }
    }
    return 'vendor/';
  })();

  function vendorUrl(name) { return _vendorDir + name; }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('加载脚本失败: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureJszip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return loadScript(vendorUrl('jszip.min.js')).then(function () { return window.JSZip; });
  }

  function ensurePdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return loadScript(vendorUrl('pdf.min.js')).then(function () { return window.pdfjsLib; });
  }

  // ---------- 通用工具 ----------
  function decodeEntities(s) {
    // textarea 技巧：解析 HTML 实体
    var ta = document.createElement('textarea');
    ta.innerHTML = s;
    return ta.value;
  }

  function inlineText(s) {
    var t = String(s == null ? '' : s);
    t = t.replace(/<[^>]+>/g, ' ');
    t = decodeEntities(t);
    return t.replace(/\s+/g, ' ').trim();
  }

  function compressWhitespace(s) {
    return String(s == null ? '' : s).replace(/[\s\u00a0]+/g, ' ').trim();
  }

  function stripHtml(html) {
    var s = String(html == null ? '' : html);
    s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ');
    s = s.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, ' ');
    s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ');
    s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ');
    s = s.replace(/<[^>]+>/g, ' ');
    s = decodeEntities(s);
    return compressWhitespace(s);
  }

  function baseName(path) {
    var p = String(path || '').replace(/[\\/]+/g, '/');
    var name = p.split('/').pop();
    return (name || '').replace(/\.[^.]+$/, '');
  }

  function parseXml(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('XML 解析失败');
    }
    return doc;
  }

  function findByLocalName(doc, name) {
    var els = doc.getElementsByTagName('*');
    for (var i = 0; i < els.length; i++) {
      if (els[i].localName === name) return els[i];
    }
    return null;
  }

  function normalizeZipPath(p) {
    return String(p).replace(/^\.?\//, '').replace(/\/{2,}/g, '/');
  }

  // 相对 OPF 路径解析 href → zip 内路径
  function resolvePath(baseFile, href) {
    var h = String(href || '').split('#')[0];
    if (!h) return baseFile;
    if (h.charAt(0) === '/') return normalizeZipPath(h);
    var baseDir = '';
    var bf = baseFile;
    if (bf.indexOf('/') >= 0) baseDir = bf.slice(0, bf.lastIndexOf('/') + 1);
    var parts = (baseDir + h).split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (!seg || seg === '.') continue;
      if (seg === '..') { out.pop(); continue; }
      out.push(seg);
    }
    return normalizeZipPath(out.join('/'));
  }

  // ---------- 格式识别 ----------
  function detectFormat(filename) {
    if (!filename) return null;
    var dot = String(filename).lastIndexOf('.');
    var ext = dot >= 0 ? String(filename).slice(dot + 1).toLowerCase() : '';
    if (ext === 'epub') return 'epub';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'txt') return 'txt';
    if (ext === 'md' || ext === 'markdown') return 'md';
    return null;
  }

  // ---------- TXT / MD ----------
  var CHAPTER_RE = /^第[〇零一二三四五六七八九十百千0-9]{1,6}[章节回部卷篇].*$/gm;

  function parseTextFile(name, text) {
    var title = baseName(name || '') || '未命名';
    var s = String(text == null ? '' : text);

    var matches = [];
    var m;
    CHAPTER_RE.lastIndex = 0;
    while ((m = CHAPTER_RE.exec(s)) !== null) {
      matches.push({ index: m.index, title: m[0].trim() });
      if (m.index === CHAPTER_RE.lastIndex) CHAPTER_RE.lastIndex++; // 防死循环
    }

    var chapters = [];
    if (matches.length >= 2) {
      for (var i = 0; i < matches.length; i++) {
        var start = matches[i].index;
        var end = i + 1 < matches.length ? matches[i + 1].index : s.length;
        var body = s.slice(start + matches[i].title.length, end).trim();
        chapters.push({ title: matches[i].title, text: body });
      }
    } else if (s.length > 12000) {
      var chunk = 4000;
      var pos = 0;
      var idx = 0;
      while (pos < s.length) {
        var endPos = Math.min(pos + chunk, s.length);
        if (endPos < s.length) {
          var nl = s.lastIndexOf('\n', endPos);
          if (nl > pos + chunk / 2) endPos = nl;
        }
        idx++;
        var seg = s.slice(pos, endPos).trim();
        if (seg) chapters.push({ title: '片段' + idx, text: seg });
        pos = endPos;
      }
    } else if (s.trim()) {
      chapters.push({ title: '全文', text: s.trim() });
    }

    chapters = chapters.filter(function (c) { return c && c.text && c.text.length > 0; });
    return { title: title, chapters: chapters };
  }

  // ---------- EPUB ----------
  function firstTitleText(html) {
    var m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
    if (m) { var t = inlineText(m[1]); if (t) return t; }
    var h = html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/i);
    if (h) { var t2 = inlineText(h[1]); if (t2) return t2; }
    return '';
  }

  function isHtmlItem(item) {
    if (!item) return false;
    if (item.mediaType && item.mediaType.indexOf('html') >= 0) return true;
    return /\.(xhtml|html|htm)$/i.test(item.href || '');
  }

  function parseEpub(arrayBuffer) {
    return ensureJszip().then(function (JSZip) {
      return JSZip.loadAsync(arrayBuffer).then(function (zip) {
        var map = {};
        zip.forEach(function (relPath) { map[normalizeZipPath(relPath)] = relPath; });

        function readText(path) {
          var orig = map[normalizeZipPath(path)];
          if (orig == null) throw new Error('EPUB 内找不到文件: ' + path);
          var f = zip.file(orig);
          if (!f) throw new Error('EPUB 内找不到文件: ' + path);
          return f.async('string');
        }

        return readText('META-INF/container.xml').then(function (containerText) {
          var containerDoc = parseXml(containerText);
          var rootfile = findByLocalName(containerDoc, 'rootfile');
          if (!rootfile) throw new Error('container.xml 缺少 rootfile');
          var opfPath = rootfile.getAttribute('full-path');
          if (!opfPath) throw new Error('container.xml 缺少 full-path');

          return readText(opfPath).then(function (opfText) {
            var opfDoc = parseXml(opfText);
            var titleEl = findByLocalName(opfDoc, 'title');
            var creatorEl = findByLocalName(opfDoc, 'creator');
            var title = (titleEl && titleEl.textContent || '').trim();
            var author = (creatorEl && creatorEl.textContent || '').trim();

            var manifest = {};
            var all = opfDoc.getElementsByTagName('*');
            for (var i = 0; i < all.length; i++) {
              var el = all[i];
              if (el.localName === 'item' && el.getAttribute('href') && el.getAttribute('id')) {
                manifest[el.getAttribute('id')] = {
                  href: el.getAttribute('href'),
                  mediaType: (el.getAttribute('media-type') || '').toLowerCase()
                };
              }
            }

            var spine = [];
            var spineEl = findByLocalName(opfDoc, 'spine');
            if (spineEl) {
              var kids = spineEl.childNodes;
              for (var j = 0; j < kids.length; j++) {
                var c = kids[j];
                if (c.nodeType === 1 && c.localName === 'itemref' && c.getAttribute('idref')) {
                  spine.push(c.getAttribute('idref'));
                }
              }
            }

            var chain = Promise.resolve();
            var chapters = [];
            for (var k = 0; k < spine.length; k++) {
              (function (item) {
                if (!isHtmlItem(item)) return;
                chain = chain.then(function () {
                  var path = resolvePath(opfPath, item.href);
                  return readText(path).then(function (html) {
                    var cTitle = firstTitleText(html) || baseName(item.href) || '未命名';
                    var cText = stripHtml(html);
                    if (cText.length < 50) return;
                    chapters.push({ title: cTitle, text: cText });
                  });
                });
              })(manifest[spine[k]]);
            }

            return chain.then(function () {
              return { title: title, author: author, chapters: chapters };
            });
          });
        });
      });
    });
  }

  // ---------- PDF ----------
  function groupPdfPages(pages) {
    var chapters = [];
    var start = 1;
    var buf = '';
    var count = 0;
    for (var i = 0; i < pages.length; i++) {
      buf += (pages[i] || '');
      count++;
      if (count >= 20 || buf.length > 15000) {
        chapters.push({ title: '第' + start + '\u2013' + (i + 1) + '页', text: buf });
        start = i + 2;
        buf = '';
        count = 0;
      }
    }
    if (buf || chapters.length === 0) {
      chapters.push({ title: '第' + start + '\u2013' + pages.length + '页', text: buf });
    }
    return chapters.filter(function (c) { return c && c.text && c.text.length > 0; });
  }

  function parsePdf(arrayBuffer, onProgress) {
    return ensurePdfjs().then(function (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.min.js');
      var data = new Uint8Array(arrayBuffer);
      var loadingTask = pdfjsLib.getDocument({ data: data });

      return loadingTask.promise.then(function (pdf) {
        var totalPages = Math.min(pdf.numPages || 0, 600);
        var pages = [];
        var metaPromise = pdf.getMetadata().catch(function () { return null; });

        var chain = Promise.resolve();
        for (var p = 1; p <= totalPages; p++) {
          (function (pageNum) {
            chain = chain.then(function () {
              return pdf.getPage(pageNum).then(function (page) {
                return page.getTextContent().then(function (tc) {
                  var text = '';
                  for (var i = 0; i < tc.items.length; i++) {
                    var it = tc.items[i];
                    if (it && it.str) text += it.str;
                  }
                  pages[pageNum - 1] = text;
                  if (onProgress) onProgress({ page: pageNum, totalPages: totalPages });
                });
              });
            });
          })(p);
        }

        return chain.then(function () { return metaPromise; }).then(function (meta) {
          var title = '';
          if (meta && meta.info && meta.info.Title) title = String(meta.info.Title).trim();
          return { title: title, chapters: groupPdfPages(pages) };
        });
      });
    });
  }

  window.ShiyeParse = {
    detectFormat: detectFormat,
    parseTextFile: parseTextFile,
    parseEpub: parseEpub,
    parsePdf: parsePdf
  };
})();

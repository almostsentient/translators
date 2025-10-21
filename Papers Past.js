{
	"translatorID": "1b052690-16dd-431d-9828-9dc675eb55f6",
	"label": "Papers Past",
	"creator": "Philipp Zumstein, Abe Jellinek, and Gemini",
	"target": "^https?://(www\\.)?paperspast\\.natlib\\.govt\\.nz/",
	"minVersion": "5.0",
	"maxVersion": "",
	"priority": 200,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2025-10-21 15:10:00"
}

/*
	This translator uses a hybrid approach:
	1. For Newspaper articles, it uses a modern, metadata-first approach.
	2. For all other collections, it uses the original screen-scraping logic.
*/

function detectWeb(doc, url) {
	if (/\/newspapers\/.+\.\d+\.\d+/.test(url)) {
		return "newspaperArticle";
	}
	if (/[?&]query=/.test(url) && getSearchResults(doc, true)) { //
		return "multiple";
	} else if (ZU.xpathText(doc, '//h3[@itemprop="headline"]')) { //
		if (url.includes('/periodicals/')) { //
			return "journalArticle";
		}
		if (url.includes('/manuscripts/')) { //
			return "letter";
		}
		if (url.includes('/parliamentary/')) { //
			return "report";
		}
	}
	return false;
}

function doWeb(doc, url) {
	var detectedType = detectWeb(doc, url);
	if (detectedType == "newspaperArticle") {
		scrapeNewspaper(doc, url);
	} else if (detectedType == "multiple") {
		Zotero.selectItems(getSearchResults(doc, false), function (items) { //
			if (!items) return;
			var articles = [];
			for (var i in items) {
				articles.push(i);
			}
			ZU.processDocuments(articles, scrapeLegacy);
		});
	} else {
		scrapeLegacy(doc, url);
	}
}

function scrapeNewspaper(doc, url) {
	const item = new Zotero.Item("newspaperArticle");
	const ld = getJSONLD(doc);
	const news = ld && ld.find(o => /NewsArticle|Article/i.test(o['@type'])) || null;
	const meta = collectMeta(doc);
	const titles = [];
	if (news?.headline) titles.push(ZU.trimInternal(news.headline));
	if (meta.hw.citation_title) titles.push(ZU.trimInternal(meta.hw.citation_title));
	if (meta.dc["DC.title"]) titles.push(ZU.trimInternal(meta.dc["DC.title"]));
	var rawTitle = dedupeFirst(titles);
	const letters = rawTitle.replace(/[^A-Za-z]/g, "");
	if (letters) {
		const uppers = (letters.match(/[A-Z]/g) || []).length;
		const upperRatio = uppers / letters.length;
		if (upperRatio > 0.6) {
			item.title = ZU.capitalizeTitle(rawTitle.toLowerCase(), true);
		} else {
			item.title = rawTitle;
		}
	} else {
		item.title = rawTitle;
	}
	item.publicationTitle = news?.isPartOf?.name || meta.hw.citation_journal_title || meta.dc["DC.publisher"] || meta.dc["DC.source"] || "";
	item.date = ZU.strToISO(news?.datePublished) || ZU.strToISO(meta.hw.citation_date) || ZU.strToISO(meta.dc["DC.date"]) || "";
	const pageStart = news?.pageStart || meta.hw.citation_firstpage || "";
	const pageEnd = news?.pageEnd || meta.hw.citation_lastpage || "";
	const pagesMeta = meta.hw.citation_pages || "";
	item.pages = pagesFrom(pageStart, pageEnd, pagesMeta);
	item.language = news?.inLanguage || meta.hw.citation_language || meta.dc["DC.language"] || "";
	item.rights = news?.copyrightNotice || meta.dc["DC.rights"] || "";
	item.url = ZU.cleanUrl(canonicalURL(doc) || news?.url || meta.hw.citation_fulltext_html_url || meta.dc["DC.source"] || url);
	const bib = parseBibliographicDetails(doc);
	if (!item.publicationTitle && bib.publicationTitle) item.publicationTitle = bib.publicationTitle;
	if (!item.date && bib.date) item.date = ZU.strToISO(bib.date);
	if (!item.pages && bib.pages) item.pages = bib.pages;
	const vol = (news?.isPartOf?.volumeNumber ? String(news.isPartOf.volumeNumber) : "") || meta.hw.citation_volume || bib.volume || "";
	const iss = (news?.isPartOf?.issueNumber ? String(news.isPartOf.issueNumber) : "") || meta.hw.citation_issue || bib.issue || "";
	if (vol || iss) {
		if (vol && iss) {
			item.edition = `Volume ${vol}, Issue ${iss}`;
		} else if (vol) {
			item.edition = `Volume ${vol}`;
		} else if (iss) {
			item.edition = `Issue ${iss}`;
		}
	}
	item.creators = [];
	item.attachments = [{ title: "Snapshot", document: doc }];
	item.libraryCatalog = "Papers Past";
	item.complete();
}

function getSearchResults(doc, checkOnly) {
	var items = {}; //
	var found = false; //
	var rows = doc.querySelectorAll('.search-results .article-preview__title a'); //
	for (var i = 0; i < rows.length; i++) {
		var href = rows[i].href;
		var title = ZU.trimInternal(rows[i].textContent);
		if (!href || !title) continue;
		if (checkOnly) return true;
		found = true;
		items[href] = title;
	}
	return found ? items : false;
}

function scrapeLegacy(doc, url) {
	var type = detectWeb(doc, url); //
	if (!type) return false;
	var item = new Zotero.Item(type); //
	var title = ZU.xpathText(doc, '//h3[@itemprop="headline"]/text()[1]'); //
	item.title = ZU.capitalizeTitle(title.toLowerCase(), true); //
	if (type == "journalArticle" || type == "newspaperArticle") {
		var nav = doc.querySelectorAll('#breadcrumbs .breadcrumbs__crumb'); //
		if (nav.length > 1) item.publicationTitle = nav[1].textContent;
		if (nav.length > 2) item.date = ZU.strToISO(nav[2].textContent);
		if (nav.length > 3) item.pages = nav[3].textContent.match(/\d+/)[0];
	}
	var container = ZU.xpathText(doc, '//h3[@itemprop="headline"]/small'); //
	if (container) {
		var volume = container.match(/Volume (\w+)\b/);
		if (volume) item.volume = volume[1];
		var issue = container.match(/Issue (\w+)\b/);
		if (issue) item.issue = issue[1];
	}
	if (type == "letter") { //
		var author = ZU.xpathText(doc, '//div[@id="researcher-tools-tab"]//tr[td[.="Author"]]/td[2]'); //
		if (author && !author.includes("Unknown")) {
			author = author.replace(/^[0-9/]*/, '').replace(/[0-9-]*$/, '').replace('(Sir)', '');
			item.creators.push(ZU.cleanAuthor(author, "author"));
		}
		var recipient = ZU.xpathText(doc, '//div[@id="researcher-tools-tab"]//tr[td[.="Recipient"]]/td[2]'); //
		if (recipient && !recipient.includes("Unknown")) {
			recipient = recipient.replace(/^[0-9/]*/, '').replace(/[0-9-]*$/, '').replace('(Sir)', '');
			item.creators.push(ZU.cleanAuthor(recipient, "recipient"));
		}
		item.date = ZU.xpathText(doc, '//div[@id="researcher-tools-tab"]//tr[td[.="Date"]]/td[2]'); //
		item.language = ZU.xpathText(doc, '//div[@id="researcher-tools-tab"]//tr[td[.="Language"]]/td[2]'); //
	}
	item.abstractNote = ZU.xpathText(doc, '#tab-english'); //
	item.url = ZU.xpathText(doc, '//div[@id="researcher-tools-tab"]/input/@value'); //
	if (!item.url) item.url = ZU.xpathText(doc, '#researcher-tools-tab p');
	if (!item.url || !item.url.startsWith('http')) item.url = url;
	item.attachments.push({ title: "Snapshot", document: doc }); //
	let imagePageURL = ZU.xpathText(doc, '.imagecontainer a/@href'); //
	if (imagePageURL) {
		ZU.processDocuments(imagePageURL, function (imageDoc) {
			item.attachments.push({
				title: 'Image',
				mimeType: 'image/jpeg',
				url: ZU.xpathText(imageDoc, '.imagecontainer img/@src')
			});
			item.complete();
		});
	} else {
		item.complete();
	}
}

function getJSONLD(doc) {
	const out = [];
	const nodes = doc.querySelectorAll('script[type="application/ld+json"]');
	for (const n of nodes) {
		try {
			const data = JSON.parse(n.textContent);
			if (Array.isArray(data)) data.forEach(d => out.push(d));
			else if (data) out.push(data);
		} catch (e) {}
	}
	return out;
}
function collectMeta(doc) {
	const hw = {}, dc = {};
	const metas = doc.querySelectorAll("meta[name]");
	for (const m of metas) {
		const name = m.getAttribute("name");
		const content = m.getAttribute("content") || "";
		if (!name) continue;
		if (/^citation_/i.test(name)) {
			if (name === "citation_author") {
				if (!hw[name]) hw[name] = [];
				hw[name].push(content);
			} else {
				hw[name] = content;
			}
			continue;
		}
		if (/^DC\./.test(name) || /^dc\./.test(name)) {
			dc[name.replace(/^dc\./, "DC.")] = content;
		}
	}
	return { hw, dc };
}
function parseBibliographicDetails(doc) {
	const cite = doc.querySelector('#researcher-tools-tab .citation, .tabs-panel .citation, p.citation');
	const text = cite ? cite.textContent : "";
	const out = { publicationTitle: "", volume: "", issue: "", date: "", pages: "" };
	if (!text) return out;
	const pubMatch = text.match(/^\s*([^,]+),/);
	if (pubMatch) out.publicationTitle = ZU.trimInternal(pubMatch[1]);
	const volMatch = text.match(/Volume\s+([^,]+),/i);
	if (volMatch) out.volume = ZU.trimInternal(volMatch[1]);
	const issMatch = text.match(/Issue\s+([^,]+),/i);
	if (issMatch) out.issue = ZU.trimInternal(issMatch[1]);
	const dateMatch = text.match(/Issue\s+[^,]+,\s*([^,]+),\s*Page/i) || text.match(/,\s*([^,]+),\s*Page/i);
	if (dateMatch) out.date = ZU.trimInternal(dateMatch[1]);
	const pageMatch = text.match(/Page\s+([0-9A-Za-z\-]+)/i);
	if (pageMatch) out.pages = ZU.trimInternal(pageMatch[1]);
	return out;
}
function dedupeFirst(arr) {
	const seen = new Set();
	for (const v of arr) {
		if (!v) continue;
		const k = v.toLowerCase();
		if (!seen.has(k)) {
			seen.add(k);
			return v;
		}
	}
	return arr.find(Boolean) || "";
}
function pagesFrom(start, end, meta) {
	const s = ZU.trimInternal(start), e = ZU.trimInternal(end), m = ZU.trimInternal(meta);
	if (m) return m;
	if (s && e && s !== e) return `${s}-${e}`;
	if (s) return s;
	return "";
}
function canonicalURL(doc) {
	let url = ZU.xpathText(doc, '//link[@rel="canonical"]/@href');
	if (url) return url;
	url = ZU.xpathText(doc, '//meta[@property="og:url"]/@content');
	return url;
}
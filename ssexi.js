(()=>{
	let send = (elt, type, detail)=>elt.dispatchEvent(new CustomEvent("fx:sse:" + type, {detail, cancelable:true, bubbles:true, composed:true}))
	async function* parseSSE(reader) {
		let buf = '', dec = new TextDecoder(), msg = {data:'', event:'', id:'', retry:null}
		while (true) {
			let {done, value} = await reader.read()
			if (done) break
			buf += dec.decode(value, {stream:true})
			let lines = buf.split(/\r\n|\r|\n/)
			buf = lines.pop()
			for (let line of lines) {
				if (!line) {
					if (msg.data || msg.event || msg.id || msg.retry) yield msg
					msg = {data:'', event:'', id:'', retry:null}
				} else if (line[0] !== ':') {
					let i = line.indexOf(':'), field = i > 0 ? line.slice(0, i) : line, val = i > 0 ? line.slice(i+1).replace(/^ /, '') : ''
					if (field === 'data') msg.data += (msg.data ? '\n' : '') + val
					else if (field === 'retry') msg.retry = parseInt(val) || null
					else if (field in msg) msg[field] = val
				}
			}
		}
		if (msg.data || msg.event || msg.id || msg.retry) yield msg
	}
	document.addEventListener("fx:config", (evt)=>{
		let cfg = evt.detail.cfg, realFetch = cfg.fetch
		cfg.headers.Accept ??= "text/html, text/event-stream"
		cfg.fetch = async(url, options)=>{
			let response = await realFetch(url, options)
			if (!response.headers.get('Content-Type')?.includes('text/event-stream')) return response
			let style = cfg.sseSwap || cfg.swap, sse = cfg.sse = {lastEventId:'', retry:null, reader:response.body.getReader(), closed:false}
			sse.close = ()=>{ sse.closed = true; sse.reader?.cancel() }
			if (!send(cfg.target, 'open', {cfg, response})) { cfg.swap = 'none'; return new Response('') }
			let target = cfg.target, anchor = null
			if (style === 'outerHTML') { anchor = document.createElement('i'); anchor.style.display = 'none'; target.after(anchor) }
			let et = anchor || target
			let onVis = null
			if (cfg.sseDisconnectOnHidden) onVis = ()=>document.hidden && sse.close()
			else if (cfg.ssePauseOnHidden) onVis = ()=>document.hidden && sse.reader?.cancel()
			if (onVis) document.addEventListener('visibilitychange', onVis)
			try {
				while (!sse.closed) {
					try {
						for await (let msg of parseSSE(sse.reader)) {
							if (msg.id) sse.lastEventId = msg.id
							if (msg.retry) sse.retry = msg.retry
							if (!send(et, 'message', {cfg, message:msg})) { sse.close(); break }
							let t = target, s = style, tx = false
							if (msg.event && msg.event[0] === '{') {
								let e = JSON.parse(msg.event)
								if (e.target) t = document.querySelector(e.target)
								if (e.swap) s = e.swap
								tx = e.transition
							} else if (msg.event) { send(et, msg.event, {cfg, message:msg}); t = null }
							if (t && msg.data) {
								let swap = ()=>{
									if (s instanceof Function) s(t, msg.data)
									else if (/(before|after)(begin|end)/i.test(s)) t.insertAdjacentHTML(s, msg.data)
									else if (s in t) t[s] = msg.data
								}
								if (tx && cfg.transition) await cfg.transition(swap).finished
								else swap()
								send(t.isConnected ? t : et, 'swapped', {cfg, message:msg})
								if (t === target && anchor) { target = anchor; style = 'beforebegin' }
							}
						}
						send(et, 'close', {cfg})
					} catch(error) { send(et, 'error', {cfg, error}) }
					if (sse.closed) break
					if (!cfg.sseReconnect && !(cfg.ssePauseOnHidden && document.hidden)) break
					if (cfg.ssePauseOnHidden && document.hidden) {
						await new Promise(r=>{let h=()=>{if(!document.hidden||sse.closed){document.removeEventListener('visibilitychange',h);r()}};document.addEventListener('visibilitychange',h)})
					} else await new Promise(r=>setTimeout(r, sse.retry || 3000))
					if (sse.closed) break
					try {
						let hdrs = new Headers(options.headers)
						if (sse.lastEventId) hdrs.set('Last-Event-ID', sse.lastEventId)
						sse.reader = (await realFetch(url, {...options, headers: hdrs})).body.getReader()
					} catch(error) { send(et, 'error', {cfg, error}); continue }
				}
			} finally {
				anchor?.remove()
				if (onVis) document.removeEventListener('visibilitychange', onVis)
			}
			cfg.swap = 'none'
			return new Response('')
		}
	})
})()

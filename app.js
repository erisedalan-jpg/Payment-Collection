// === 项目回款跟踪与管控平台 - 应用逻辑 ===



/**

 * ClockService - 时钟服务组件

 * 提供系统时间获取，支持依赖注入和降级处理

 * @description

 *   时区依赖：使用浏览器本地时区（Intl.DateTimeFormat().timeZone）

 *   跨年行为：年份基于本地时区的当前年份，跨年边界自动切换

 *   返回值格式：整型年份（如2026）

 *   线程安全：JS单线程环境下天然安全，所有方法幂等

 *   时间复杂度：O(1)

 * @example

 *   const clock = new ClockService();

 *   clock.getCurrentYear(); // 2026

 *   const mockClock = new ClockService(() => new Date('2027-01-01'));

 *   mockClock.getCurrentYear(); // 2027

 */

class ClockService {

  /**

   * @param {Function} [timeProvider] - 可选的时间提供函数，默认使用系统Date

   *   注入后业务逻辑与系统底层时间解耦，便于测试和Mock

   */

  constructor(timeProvider) {

    this._timeProvider = timeProvider || (() => new Date());

  }



  /**

   * 获取当前年份

   * @returns {number} 当前年份（整型），如2026

   * @throws 不会抛出异常，失败时降级返回Date().getFullYear()

   */

  getCurrentYear() {

    try {

      return this._timeProvider().getFullYear();

    } catch (e) {

      console.error('[ClockService] 时间获取失败，降级使用系统时间', e);

      return new Date().getFullYear();

    }

  }



  /**

   * 获取周期切换选项列表

   * @returns {Array<{key:string, label:string}>} 选项数组：全部、本年度、下一年度

   */

  getYearOptions() {

    const y = this.getCurrentYear();

    return [

      {key:'all', label:'周期切换'},

      {key:String(y), label:'本年度'},

      {key:String(y+1), label:'下一年度'},

      {key:'upto'+String(y), label:'至本年度'},

      {key:'upto'+String(y+1), label:'至下一年度'},

      {key:y+'-Q1', label:y+'年Q1季度'},

      {key:y+'-Q2', label:y+'年Q2季度'},

      {key:y+'-Q3', label:y+'年Q3季度'},

      {key:y+'-Q4', label:y+'年Q4季度'},

      {key:(y+1)+'-Q1', label:(y+1)+'年Q1季度'},

      {key:(y+1)+'-Q2', label:(y+1)+'年Q2季度'},

      {key:(y+1)+'-Q3', label:(y+1)+'年Q3季度'},

      {key:(y+1)+'-Q4', label:(y+1)+'年Q4季度'},

      {key:'upto'+y+'-Q1', label:'至'+y+'年Q1季度'},

      {key:'upto'+y+'-Q2', label:'至'+y+'年Q2季度'},

      {key:'upto'+y+'-Q3', label:'至'+y+'年Q3季度'},

      {key:'upto'+y+'-Q4', label:'至'+y+'年Q4季度'},

      {key:'upto'+(y+1)+'-Q1', label:'至'+(y+1)+'年Q1季度'},

      {key:'upto'+(y+1)+'-Q2', label:'至'+(y+1)+'年Q2季度'},

      {key:'upto'+(y+1)+'-Q3', label:'至'+(y+1)+'年Q3季度'},

      {key:'upto'+(y+1)+'-Q4', label:'至'+(y+1)+'年Q4季度'}

    ];

  }

}



/** 全局时钟单例 */

const clockService = new ClockService();



const D = typeof ANALYSIS_DATA !== 'undefined' ? ANALYSIS_DATA : {meta:{},dashboard:{},summary:{},rawNodes:[],displayColumns:[]};


// Unified naguan-filtered node access
function _filteredRawNodes(){
  if(!_naguanOn || !D.naguanExclude) return D.rawNodes;
  return D.rawNodes.filter(function(n){ return !D.naguanExclude[n.projectId]; });
}

let curTier = '', curTab = 'projects', curPage = 'dashboard';
/** 页面切换性能优化标志：为true时暂停markOverflow强制布局扫描，避免页面切换卡顿 */
let _pageSwitching = false;
/** 视角模式：'global'=全局视角, 'l4'=L4视角, 'pm'=PM视角 */
let _viewMode = 'global';
/** 当前选中的L4部门（L4视角下） */
let _viewL4 = '';
/** 当前选中的项目经理（PM视角下） */
let _viewPM = '';
let _naguanOn = localStorage.getItem('naguan_on') !== 'false'; // persisted
function toggleNaguan(){
  _naguanOn = document.getElementById('naguanSwitch').checked;
  localStorage.setItem('naguan_on', _naguanOn?'true':'false');
  var s = document.getElementById('naguanStatus');
  if(s) s.textContent = _naguanOn ? '已开启' : '已关闭';
  if(curPage === 'dashboard'){ initDash(); setTimeout(function(){ window._refreshDashTopCharts(); updateBadges(); },300); }
  else if(curPage === 'tier'){ renderTier(); updateBadges(); }
  else if(curPage === 'ledger') initLedger();
  else if(curPage === 'followup') initFollowup();
  else if(curPage === 'pmview') initPmView();
  else if(curPage === 'compare') initCompare();
  else if(curPage === 'calendar') initCalendarPage();
}

const APP_VERSION = '5.9.2';


// ========== Column Filter System ==========
var CF={
  _filters:{},
  _currentTableId:'',
  _currentColKey:'',
  _closeHandler:null,
  _scrollHandler:null,
  _currentEl:null,
  _linkageOn:false,
  _planBoardIds:['planBoard_0','planBoard_1','planBoard_2','planBoard_3','planBoard_4','planBoard_5'],
  _refreshMap:{},
  _dataMap:{},
  register:function(tableId,refreshFn,dataFn){this._refreshMap[tableId]=refreshFn;this._dataMap[tableId]=dataFn},
  getColType:function(key){
    return'enum';
  },
  formatValue:function(key,val){
    if(val===null||val===undefined||val==='')return'空值';
    if(isDateKey(key)){var ed=excelDate(val);if(ed)return ed;if(typeof val==='string'&&/^\d{4}-\d{2}/.test(val))return val.slice(0,10)}
    if(typeof val==='string'&&/^\d{4,5}$/.test(val)){var ed2=excelDate(val);if(ed2)return ed2}
    if(val===true||val==='true')return'是';
    if(val===false||val==='false')return'否';
    /* 百分比列使用pct()格式化，确保筛选器枚举值显示为百分比（如80%）而非小数（如0.8） */
    if(key==='planPaymentRatio'||key==='paymentRatio'||key==='actualPaymentRatio'||key==='projectCompletion')return pct(val);
    return String(val);
  },
  renderIcon:function(tableId,colKey){
    var a=this._filters[tableId]&&this._filters[tableId][colKey];
    var c=a?'var(--primary)':'var(--gray-300)';
    var bg=a?'var(--primary-50)':'transparent';
    return'<span class="cf-icon" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:3px;cursor:pointer;color:'+c+';background:'+bg+';margin-left:3px;font-size:11px;transition:all .15s;vertical-align:middle" onclick="CF.showPopup(\''+tableId+'\',\''+colKey+'\',this,event)" onmouseover="this.style.background=\'var(--primary-50)\';this.style.color=\'var(--primary)\'" onmouseout="if(!CF._filters[\''+tableId+'\']||!CF._filters[\''+tableId+'\'][\''+colKey+'\']){this.style.background=\'transparent\';this.style.color=\'var(--gray-300)\'}">&#9660;</span>';
  },
  showPopup:function(tableId,colKey,el,event){
    event.stopPropagation();this.closePopup();
    this._currentTableId=tableId;
    this._currentColKey=colKey;
    this._currentEl=el;
    var type=this.getColType(colKey);
    var cur=(this._filters[tableId]&&this._filters[tableId][colKey])||{};
    var popup=document.createElement('div');popup.className='cf-popup';popup.id='cfPopup';
    var rect=el.getBoundingClientRect();
    popup.style.position='fixed';popup.style.zIndex='1100';
    popup.style.top=(rect.bottom+4)+'px';
    var leftPos=rect.left;
    if(leftPos+240>window.innerWidth)leftPos=window.innerWidth-250;
    popup.style.left=leftPos+'px';
    var html='<div class="cf-popup-inner">';
    if(type==='enum'){
      var data=this._dataMap[tableId]?this._dataMap[tableId]():[];
      var uvMap={};data.forEach(function(r){var v=r[colKey];var fv=CF.formatValue(colKey,v);if(!uvMap[fv])uvMap[fv]=v;else uvMap[fv]=v});
      var rawUv={};data.forEach(function(r){var v=r[colKey];if(v!=null&&v!==''){rawUv[v]=(rawUv[v]||0)+1}else{rawUv['']=((rawUv['']||0)+1)}});
      var displayKeys=Object.keys(uvMap).sort();
      var sel=cur.value||Object.keys(rawUv).sort();
      html+='<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--dark)">列筛选 <span id="cfCount" style="color:var(--gray);font-weight:400">('+displayKeys.length+'个值)</span></div>';
      html+='<input type="text" id="cfSearch" placeholder="搜索筛选选项..." style="width:100%;padding:4px 8px;font-size:11px;border:1px solid var(--border);border-radius:4px;margin-bottom:4px;outline:none;box-sizing:border-box" oninput="CF.searchEnum(this.value)">';
      html+='<label style="font-size:11px;margin-bottom:4px;display:flex;align-items:center;gap:4px;cursor:pointer;padding:2px 0;border-bottom:1px solid var(--border-light);margin-bottom:4px"><input type="checkbox" id="cfSelectAll" onchange="CF.toggleAllEnum(this)" '+(sel.length===Object.keys(rawUv).length?'checked':'')+'> 全选/取消全选</label>';
      html+='<div style="max-height:200px;overflow-y:auto">';
      displayKeys.forEach(function(dk){
        var rv=uvMap[dk];
        var fv=CF.formatValue(colKey,rv);
        var ch=sel.indexOf(fv)>=0||sel.indexOf(String(rv))>=0||sel.indexOf(rv)>=0?'checked':'';
        var displayText=dk.length>16?dk.slice(0,16)+'…':dk;
        html+='<label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;padding:2px 0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+dk.replace(/"/g,'"')+'"><input type="checkbox" class="cf-enum-cb" data-raw="'+fv.replace(/"/g,'"')+'" '+ch+'> <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px" title="'+dk.replace(/"/g,'"')+'">'+displayText+'</span></label>';
      });
      html+='</div>';
    }
    html+='<div style="display:flex;gap:4px;margin-top:8px">';
    html+='<button id="cfBtnApply" style="width:80px;padding:4px 0;font-size:11px;border:1px solid var(--border);border-radius:4px;background:#fff;cursor:pointer;transition:background .1s,color .1s" onmousedown="this.style.background=\'var(--primary)\';this.style.color=\'#fff\';this.style.borderColor=\'var(--primary)\'" onmouseup="this.style.background=\'#fff\';this.style.color=\'\';this.style.borderColor=\'var(--border)\'" onmouseleave="this.style.background=\'#fff\';this.style.color=\'\';this.style.borderColor=\'var(--border)\'" onclick="event.stopPropagation();CF.apply(\''+tableId+'\',\''+colKey+'\',\''+type+'\')">确定</button>';
    html+='<button id="cfBtnClear" style="width:80px;padding:4px 0;font-size:11px;border:1px solid var(--border);border-radius:4px;background:#fff;cursor:pointer;transition:background .1s,color .1s" onmousedown="this.style.background=\'var(--red)\';this.style.color=\'#fff\';this.style.borderColor=\'var(--red)\'" onmouseup="this.style.background=\'#fff\';this.style.color=\'\';this.style.borderColor=\'var(--border)\'" onmouseleave="this.style.background=\'#fff\';this.style.color=\'\';this.style.borderColor=\'var(--border)\'" onclick="event.stopPropagation();CF.clearColumn(\''+tableId+'\',\''+colKey+'\')">清除</button>';
    html+='</div></div>';
    popup.innerHTML=html;
    document.body.appendChild(popup);
    var self=this;
    this._closeHandler=function(e){if(!popup.contains(e.target)&&e.target!==el){self.closePopup()}};
    setTimeout(function(){document.addEventListener('click',self._closeHandler)},0);
    // Scroll-follow: reposition popup when any ancestor scrolls or window scrolls
    this._scrollHandler=function(){
      if(!self._currentEl||!document.getElementById('cfPopup')){self.closePopup();return}
      var r=self._currentEl.getBoundingClientRect();
      // If trigger element is scrolled out of viewport, close popup
      if(r.bottom<0||r.top>window.innerHeight||r.right<0||r.left>window.innerWidth){self.closePopup();return}
      var p=document.getElementById('cfPopup');
      if(!p)return;
      p.style.top=(r.bottom+4)+'px';
      var lp=r.left;if(lp+240>window.innerWidth)lp=window.innerWidth-250;
      p.style.left=lp+'px';
    };
    // Listen to scroll on all ancestor scroll containers + window
    var ancestors=[];var node=el.parentElement;
    while(node&&node!==document.body){if(node.scrollHeight>node.clientHeight||node.scrollWidth>node.clientWidth){ancestors.push(node)}node=node.parentElement}
    ancestors.forEach(function(a){a.addEventListener('scroll',self._scrollHandler)});
    window.addEventListener('scroll',self._scrollHandler);
    this._scrollAncestors=ancestors;
  },
  closePopup:function(){
    var p=document.getElementById('cfPopup');if(p)p.remove();
    if(this._closeHandler){document.removeEventListener('click',this._closeHandler);this._closeHandler=null}
    if(this._scrollHandler){
      window.removeEventListener('scroll',this._scrollHandler);
      if(this._scrollAncestors){this._scrollAncestors.forEach(function(a){a.removeEventListener('scroll',CF._scrollHandler)})}
      this._scrollHandler=null;this._scrollAncestors=null;
    }
    this._currentEl=null;
  },
  /** 搜索筛选选项：不区分大小写包含匹配，隐藏不匹配的label，自动勾选匹配项，自动apply刷新页面 */
  searchEnum:function(keyword){
    /* 边界条件：□ null/undefined □ 字符串 □ 超长输入 □ 并发调用不适用 */
    if(keyword===null||keyword===undefined)keyword='';
    var kw=String(keyword).toLowerCase();
    var labels=document.querySelectorAll('#cfPopup .cf-popup-inner label');
    /* labels包含全选label和选项label，需区分 */
    var total=0,visible=0;
    labels.forEach(function(label){
      var cb=label.querySelector('.cf-enum-cb');
      if(!cb)return; /* 跳过全选label */
      total++;
      /* 用span的title属性获取完整文本（未截断的原始值） */
      var span=label.querySelector('span');
      var text=span?span.getAttribute('title')||span.textContent:'';
      if(kw===''){
        label.style.display='';
        visible++;
        /* 清空搜索时恢复全选 */
        cb.checked=true;
      }else{
        if(text.toLowerCase().indexOf(kw)>=0){
          label.style.display='';
          visible++;
          /* 搜索时自动勾选匹配项 */
          cb.checked=true;
        }else{
          label.style.display='none';
          /* 搜索时自动取消不匹配项 */
          cb.checked=false;
        }
      }
    });
    /* 更新计数显示 */
    var countEl=document.getElementById('cfCount');
    if(countEl){
      if(kw===''){
        countEl.textContent='('+total+'个值)';
      }else{
        countEl.textContent='('+visible+'/'+total+'个值)';
      }
    }
    /* 更新全选checkbox状态 */
    var selectAllCb=document.getElementById('cfSelectAll');
    if(selectAllCb){
      if(kw===''){
        selectAllCb.checked=true;
      }else{
        /* 搜索时全选=所有可见项都勾选 */
        selectAllCb.checked=(visible>0);
      }
    }
    /* 直接更新筛选状态并刷新页面数据，但不关闭弹窗（用户可继续输入调整） */
    var cbs2=document.querySelectorAll('.cf-enum-cb');var sel2=[];
    cbs2.forEach(function(cb){if(cb.checked)sel2.push(cb.getAttribute('data-raw'))});
    var tid=this._currentTableId,ck=this._currentColKey;
    if(!this._filters[tid])this._filters[tid]={};
    if(sel2.length===0){
      this._filters[tid][ck]={type:'enum',value:[]};
    }else if(sel2.length===cbs2.length){
      /* 全选=无筛选 */
      delete this._filters[tid][ck];
    }else{
      this._filters[tid][ck]={type:'enum',value:sel2};
    }
    /* 联动同步 */
    if(this._linkageOn&&this._planBoardIds.indexOf(tid)>=0){
      this.syncFilters(tid,ck);
    }
    /* 刷新数据 */
    this._refresh(tid);
  },
  toggleAllEnum:function(el){
    /* 仅操作可见的cf-enum-cb，不影响被搜索隐藏的项 */
    var cbs=document.querySelectorAll('.cf-enum-cb');
    cbs.forEach(function(cb){
      var label=cb.closest('label');
      if(label&&label.style.display==='none')return; /* 跳过隐藏项 */
      cb.checked=el.checked;
    });
  },
  apply:function(tableId,colKey,type){
    if(!this._filters[tableId])this._filters[tableId]={};
    if(type==='enum'){
      var cbs=document.querySelectorAll('.cf-enum-cb');var sel=[];
      cbs.forEach(function(cb){if(cb.checked)sel.push(cb.getAttribute('data-raw'))});
      if(sel.length===0){this._filters[tableId][colKey]={type:'enum',value:[]};this.closePopup();this._refresh(tableId);return}
      // Auto-clear when all values selected (全选 = 无筛选)
      if(sel.length===cbs.length){if(this._filters[tableId])delete this._filters[tableId][colKey];this.closePopup();this._refresh(tableId);return}
      this._filters[tableId][colKey]={type:type,value:sel};
    }else{
      var op=document.getElementById('cfOp').value;
      var val=document.getElementById('cfVal').value;
      if(!val){this.clearColumn(tableId,colKey);return}
      this._filters[tableId][colKey]={type:type,op:op,value:type==='number'?Number(val):val};
    }
    // Sync filter to linked planBoard tables if linkage is on
    if(this._linkageOn&&this._planBoardIds.indexOf(tableId)>=0){
      this.syncFilters(tableId,colKey);
    }
    this.closePopup();this._refresh(tableId);
  },
  clearColumn:function(tableId,colKey){
    if(this._filters[tableId])delete this._filters[tableId][colKey];
    // Sync clear to linked planBoard tables if linkage is on
    if(this._linkageOn&&this._planBoardIds.indexOf(tableId)>=0){
      this._planBoardIds.forEach(function(tid){if(tid!==tableId&&CF._filters[tid])delete CF._filters[tid][colKey]});
      this._planBoardIds.forEach(function(tid){if(tid!==tableId)CF._refresh(tid)});
    }
    this.closePopup();this._refresh(tableId);
  },
  clearAll:function(tableId){
    this._filters[tableId]={};this._refresh(tableId);
  },
  filterData:function(tableId,data){
    var filters=this._filters[tableId];if(!filters)return data;
    return data.filter(function(row){
      for(var ck in filters){
        var f=filters[ck];var cv=row[ck];
        if(f.type==='enum'){
          var match=false;
          var fv=CF.formatValue(ck,cv);
          for(var i=0;i<f.value.length;i++){
            if(fv===f.value[i]||String(cv)===f.value[i]){match=true;break}
          }
          if(!match)return false;
        }else if(f.type==='text'){
          var s=(cv!=null?String(cv):'').toLowerCase();var v=f.value.toLowerCase();
          if(f.op==='contains'&&s.indexOf(v)<0)return false;
          if(f.op==='notcontains'&&s.indexOf(v)>=0)return false;
          if(f.op==='equals'&&s!==v)return false;
        }else if(f.type==='number'){
          var n=Number(cv)||0;
          if(f.op==='gt'&&!(n>f.value))return false;
          if(f.op==='lt'&&!(n<f.value))return false;
          if(f.op==='eq'&&Math.abs(n-f.value)>0.001)return false;
        }
      }
      return true;
    });
  },
  hasFilters:function(tableId){return this._filters[tableId]&&Object.keys(this._filters[tableId]).length>0},
  _refresh:function(tableId){if(this._refreshMap[tableId])this._refreshMap[tableId]()},
  renderClearBtn:function(tableId){
    if(!this.hasFilters(tableId))return'';
    return'<button class="btn btn-outline" style="font-size:11px;padding:2px 10px;margin-left:8px;color:var(--red);border-color:var(--red-200)" onclick="CF.clearAll(\''+tableId+'\')">清除所有筛选</button>';
  },
  activeCount:function(tableId){return this._filters[tableId]?Object.keys(this._filters[tableId]).length:0},
  /** Sync a column filter from source table to all other planBoard tables */
  syncFilters:function(sourceTableId,colKey){
    var filterVal=this._filters[sourceTableId]&&this._filters[sourceTableId][colKey];
    this._planBoardIds.forEach(function(tid){
      if(tid===sourceTableId)return;
      if(!CF._filters[tid])CF._filters[tid]={};
      if(filterVal){CF._filters[tid][colKey]=filterVal}
      else{delete CF._filters[tid][colKey]}
      CF._refresh(tid);
    });
  },
  /** Toggle linkage on/off for planBoard tables */
  toggleLinkage:function(){
    this._linkageOn=!this._linkageOn;
    var btn=document.getElementById('cfLinkageBtn');
    if(btn){
      btn.classList.toggle('cf-linkage-on',this._linkageOn);
      btn.textContent=this._linkageOn?'筛选联动(已启用)':'筛选联动';
    }
  }
};

let filterYear = 'all'; // 'all' | '2026' | '2027' | 'upto2026' | 'upto2027' etc.

/** Helper: get the effective end-month string from filterYear for month comparison */
function _getFilterYearEndMonth(){
  if(filterYear==='all')return '9999-12';
  if(filterYear.indexOf('upto')===0){
    var yr=filterYear.substring(4);
    if(yr.indexOf('-Q')>=0){
      var qMap={'Q1':'03','Q2':'06','Q3':'09','Q4':'12'};
      var parts=yr.split('-Q');
      return parts[0]+'-'+(qMap['Q'+parts[1]]||'12');
    }
    return yr+'-12';
  }
  if(filterYear.indexOf('-Q')>=0){
    var qMap2={'Q1':'03','Q2':'06','Q3':'09','Q4':'12'};
    var parts2=filterYear.split('-Q');
    return parts2[0]+'-'+(qMap2['Q'+parts2[1]]||'12');
  }
  return filterYear+'-12';
}

/** Helper: get the effective start-month string from filterYear for month comparison */
function _getFilterYearStartMonth(){
  if(filterYear==='all')return '0000-01';
  if(filterYear.indexOf('upto')===0) return '0000-01'; // cumulative starts from beginning
  if(filterYear.indexOf('-Q')>=0){
    var qMap={'Q1':'01','Q2':'04','Q3':'07','Q4':'10'};
    var parts=filterYear.split('-Q');
    return parts[0]+'-'+(qMap['Q'+parts[1]]||'01');
  }
  return filterYear+'-01';
}

const _charts = [];

// === Chart Layout: 柱间距恒定，任何周期下均一致 ===
// 每分类宽度=柱宽(38)+间距(19)=57px，图表宽度=catCount*57+105
// 容器够宽则图表居中无滚动条，容器不够则自动出现滚动条
const CHART_BAR_WIDTH = 38;                                    // 柱子宽度(px), 三个系列统一
const CHART_BAR_CATEGORY_GAP = Math.round(CHART_BAR_WIDTH/2); // 柱间距 = 柱宽/2 = 19(数字)
const CHART_PER_CATEGORY = CHART_BAR_WIDTH + CHART_BAR_CATEGORY_GAP; // 每分类占用宽度 = 38+19 = 57
const CHART_AXIS_POINTER_WIDTH = CHART_BAR_WIDTH + Math.round(CHART_BAR_WIDTH/2); // 阴影指示器 = 柱宽+左右各1/4柱宽 = 57
const CHART_Y_AXIS_WIDTH = 85;
const _chartScrollState = {};
/** 清理 _charts 中已销毁的实例，避免累积 */
function _cleanCharts(){
  for(var i=_charts.length-1;i>=0;i--){try{if(_charts[i].isDisposed())_charts.splice(i,1)}catch(e){_charts.splice(i,1)}}
}

function _calcChartScroll(chartDom, catCount) {
  var scrollEl = chartDom.parentElement;
  // 每分类固定 57px（38柱宽+19间距），图表宽度始终等于实际所需宽度
  var chartW = catCount * CHART_PER_CATEGORY + CHART_Y_AXIS_WIDTH + 20;
  chartDom.style.minWidth = chartW + 'px';
  chartDom.style.maxWidth = '';
  chartDom.style.width = chartW + 'px';
  // 始终允许横向滚动：容器够宽时不出现滚动条，容器窄时自动出现
  if (scrollEl) scrollEl.style.overflowX = 'auto';
  _chartScrollState[chartDom.id] = { catCount: catCount, el: chartDom };
}

/** Fill external legend bar with interactive chart series toggle */
function _fillChartLegend(legendId, items, chart) {
  var el = document.getElementById(legendId);
  if (!el) return;
  el._chart = chart;
  el.innerHTML = items.map(function(it) {
    return '<span class="chart-legend-item" data-name="' + it.name + '" onclick="_onLegendClick(this)"><span class="chart-legend-dot" style="background:' + it.color + '"></span>' + it.name + '</span>';
  }).join('');
  // Sync custom legend visual state with ECharts legend state
  if (chart) {
    chart.off('legendselectchanged');
    chart.on('legendselectchanged', function(params) { _syncLegendVisual(el, params); });
  }
}

/** Toggle chart series visibility when custom legend item is clicked */
function _onLegendClick(el) {
  var legendEl = el.closest('.chart-legend-bar');
  if (!legendEl || !legendEl._chart) return;
  var name = el.getAttribute('data-name');
  legendEl._chart.dispatchAction({ type: 'legendToggleSelect', name: name });
}

/** Sync custom legend item appearance with ECharts legend selection state */
function _syncLegendVisual(legendEl, params) {
  var items = legendEl.querySelectorAll('.chart-legend-item');
  items.forEach(function(item) {
    var name = item.getAttribute('data-name');
    item.classList.toggle('legend-disabled', params.selected[name] === false);
  });
}

window.addEventListener('resize', () => {
  // 仅触发 ECharts 自适应缩放，不重新计算滚动布局，避免容器宽度波动导致图表间距变化
  _charts.forEach(c => { try { c.resize() } catch(e) {} });
  positionYearDock();
});

function regChart(c) { _charts.forEach(ch => { try { ch.dispose() } catch(e) {} }); _charts.length = 0; _charts.push(c); return c; }



// ECharts Theme

echarts.registerTheme('ent', {

  color:['#6366F1','#8B5CF6','#10B981','#F59E0B','#EF4444','#3B82F6','#EC4899','#14B8A6'],

  backgroundColor:'transparent',

  textStyle:{fontFamily:'Inter, Noto Sans SC, sans-serif'},

  tooltip:{backgroundColor:'#0F172A',borderColor:'#334155',textStyle:{color:'#F8FAFC',fontSize:12}},

  categoryAxis:{axisLine:{lineStyle:{color:'#E2E8F0'}},axisTick:{lineStyle:{color:'#E2E8F0'}},axisLabel:{color:'#64748B',fontSize:11},splitLine:{lineStyle:{color:'#F1F5F9'}}},

  valueAxis:{axisLine:{lineStyle:{color:'#E2E8F0'}},axisTick:{lineStyle:{color:'#E2E8F0'}},axisLabel:{color:'#64748B',fontSize:11},splitLine:{lineStyle:{color:'#F1F5F9',type:'dashed'}}}

});



// === Utils ===

function escAttr(s){if(!s)return s;return String(s).replace(/&/g,'&'+'amp;').replace(/</g,'&'+'lt;').replace(/>/g,'&'+'gt;').replace(/"/g,'&'+'quot;').replace(/'/g,'&'+'#39;')}

function fmt(n,d=1){return n!=null?Number(n).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}):'-'}

function fmtYuan(n){return n!=null?Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2}):'-'}
function fmtWan(yuan){return yuan!=null?Number(yuan/10000).toLocaleString('zh-CN',{maximumFractionDigits:2}):'-'}

function fmtW(n){return n!=null?fmtYuan(n):'-'}

/**
 * pct - 比例列统一格式化函数：小数→百分数显示，与云文档原表格式一致
 * 输入0-1小数(0.8) → "80%", 输入≥1(1.08) → "108%", 输入0 → "0%",
 * 输入null/undefined/''/'空值' → '-', 输入非数字 → 原样返回
 * 边界条件：□ null/undefined输入 □ 空值/空字符串/'空值' □ 0 □ ≥1 □ 类型错误 □ 超长输入 □ 并发调用不适用
 */
function pct(n){
  if(n===null||n===undefined||n==='空值'||n==='')return '-';
  if(typeof n==='string'&&n.includes('%'))return n; // 已是百分数格式，原样返回
  const num=typeof n==='number'?n:parseFloat(String(n));
  if(isNaN(num))return '-';
  /* 整数百分比不保留小数位(100%而非100.0%)，非整数保留1位(80.5%) */
  const pctVal=num*100;
  if(pctVal===Math.round(pctVal))return Math.round(pctVal)+'%';
  return pctVal.toFixed(1)+'%';
}

/**
 * fmtRatio - 比例列格式化辅助函数，支持自定义空值提示（如"待上报"）
 * 边界条件：□ null/undefined □ 空值/'空值'/' □ 0 □ ≥1 □ 类型错误 □ 超长输入 □ 并发调用不适用
 */
function fmtRatio(v,nullLabel){
  /* nullLabel默认为'-',actualPaymentRatio等列使用'待上报' */
  const label=nullLabel||'-';
  if(v===null||v===undefined||v==='空值'||v==='')return label;
  return pct(v);
}

/**
 * pctToNum - 将百分比字符串转为0-1小数，用于数值比较计算
 * "30%" → 0.3, "0%" → 0, "空值" → null, 纯数字"30" → 0.3, 0.3 → 0.3
 * 边界条件：□ null/undefined输入 □ 空集合/空字符串 □ 类型错误 □ 超长输入 □ 并发调用不适用
 */
function pctToNum(v){
  if(v===null||v===undefined||v==='')return null;
  if(v==='空值')return null;
  const s=String(v).trim();
  if(s==='')return null;
  const m=s.match(/([\d.]+)\s*%?/);
  if(!m)return null;
  const num=parseFloat(m[1]);
  if(isNaN(num))return null;
  if(s.includes('%')||num>1)return num/100;
  return num;
}



// === Data Helpers ===

function tierNodes(t){return getFilteredNodes().filter(n=>n.tier===t)}



// Get node remaining payment amount (待回款 = 计划回款 - 已回款)

function getNodeRemaining(n){return (n.expectedPayment||0)-(n.actualPayment||0)}

// 注意：函数名含Wan但返回值为元，非万元；所有调用者使用fmtYuan格式化，逻辑正确
function getNodeRemainingWan(n){return getNodeRemaining(n)}



function groupByProject(nodes){

  const m={};

  nodes.forEach(n=>{

    if(!m[n.projectId])m[n.projectId]={projectId:n.projectId,projectName:n.projectName,orgL4:n.orgL4||'',orgL3:n.orgL3||'',projectManager:n.projectManager||'',projectType:n.projectType||'',projectAmount:n.projectAmount||0,tier:n.tier,canAdvance:false,expectedPayment:0,actualPayment:0,nodes:[]};

    const p=m[n.projectId];

    if(n.isPaymentRelated){p.expectedPayment+=n.expectedPayment||0;p.actualPayment+=n.actualPayment||0}

    if(n.canAdvance)p.canAdvance=true;

    p.nodes.push(n);

  });

  Object.values(m).forEach(p=>{

    const rel=p.nodes.filter(n=>n.isPaymentRelated);

    if(!rel.length){p.paymentStatus='待确定';p.paymentRatio=null}

    else{

      p.paymentRatio=p.expectedPayment>0?p.actualPayment/p.expectedPayment:0;

      p.remainingAmount=p.expectedPayment-p.actualPayment;

      if(rel.some(n=>n.nodeStatus==='加资源可提前'))p.paymentStatus='加资源可提前';
      else if(rel.some(n=>n.nodeStatus==='达到回款条件'))p.paymentStatus='达到回款条件';
      else if(rel.some(n=>n.nodeStatus==='已提前回款'))p.paymentStatus='已提前回款';
      else if(rel.some(n=>n.nodeStatus==='已全额回款'))p.paymentStatus='已全额回款';
      else if(rel.some(n=>n.nodeStatus==='延期'))p.paymentStatus='延期';
      else if(rel.some(n=>n.nodeStatus==='正常实施中'))p.paymentStatus='正常实施中';

      else p.paymentStatus='待确定';

    }

  });

  return Object.values(m);

}



// === Navigation ===

function nav(page){
  // 性能优化：页面切换期间暂停markOverflow，避免强制布局扫描导致卡顿
  _pageSwitching=true;

  // 离开旧页面时，只清空tierTabContent中的大表格（保留页面结构）
  if(curPage==='tier'&&page!=='tier'){
    var tc=document.getElementById('tierTabContent');if(tc)tc.innerHTML='';
    var ts=document.getElementById('tierSummary');if(ts)ts.innerHTML='';
  }

  curPage=page;

  // 同步侧边栏
  _syncSidebar();

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));

  document.getElementById('page-'+page)?.classList.add('active');

  if(page==='dashboard')initDash();

  if(page==='ledger')initLedger();

  if(page==='calendar')initCalendarPage();

  if(page==='search'){nav('ledger');return}

  if(page==='pmview')initPmView();

  if(page==='followup')initFollowup();

  if(page==='compare')initCompare();

  if(page==='data')initData();

  if(page==='about')initAbout();

  updateYearDockVisibility();
  updateViewDockVisibility();
  positionViewDock();

  // 性能优化：页面渲染完成后恢复markOverflow，并手动触发一次
  setTimeout(function(){ _pageSwitching=false; markOverflow(); },500);

}

// Drill-down filter state

let _drillFilter={status:'',tab:''};

/** Toggle sidebar collapsed/expanded state */
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const btn=document.getElementById('sidebarToggle');
  if(!sb)return;
  sb.classList.toggle('collapsed');
  const collapsed=sb.classList.contains('collapsed');
  localStorage.setItem('sidebar_collapsed',collapsed?'1':'0');
  btn.title=collapsed?'展开菜单':'收起菜单';
  // 侧边栏折叠动画结束后，图表自适应宽度
  setTimeout(function(){ _charts.forEach(function(c){ try{c.resize()}catch(e){} }); }, 250);
}

/** 统一同步侧边栏菜单高亮和展开状态，根据 curPage/curTab/curTier */
function _syncSidebar(){
  // Step 1: 清除所有 active 和 open 状态
  document.querySelectorAll('.sidebar-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.sidebar-sub-item').forEach(n=>n.classList.remove('active'));
  // 收起所有已展开的子菜单（后续根据需要重新展开）
  document.querySelectorAll('.sidebar-sub.open').forEach(s=>s.classList.remove('open'));
  document.querySelectorAll('.sidebar-parent.open').forEach(p=>p.classList.remove('open'));

  if(curPage==='tier'){
    // Step 2: 高亮父级菜单项（通过 data-page="tier-xxx" 查找）
    const parentPageId='tier-'+curTab;
    const parentEl=document.querySelector(`.sidebar-item[data-page="${parentPageId}"]`);
    if(parentEl){
      parentEl.classList.add('active');
      // 展开子菜单
      const subEl=parentEl.nextElementSibling;
      if(subEl&&subEl.classList.contains('sidebar-sub')){
        subEl.classList.add('open');
        parentEl.classList.add('open');
      }
    }
    // 备选：通过 data-tab 查找父级（兼容旧逻辑）
    const parentByTab=document.querySelector(`.sidebar-parent[data-tab="${curTab}"]`);
    if(parentByTab&&parentByTab!==parentEl){
      parentByTab.classList.add('active');
      const sub=parentByTab.nextElementSibling;
      if(sub&&sub.classList.contains('sidebar-sub')){
        sub.classList.add('open');
        parentByTab.classList.add('open');
      }
    }
    // Step 3: 高亮具体的子菜单项（tier + tab）
    if(curTier){
      const subPageId='tier-'+curTab+'-'+curTier;
      const subEl=document.querySelector(`.sidebar-sub-item[data-page="${subPageId}"]`);
      if(subEl)subEl.classList.add('active');
    }
  } else {
    // Step 4: 顶部页面（dashboard、ledger 等）
    const topEl=document.querySelector(`.sidebar-item[data-page="${curPage}"]`);
    if(topEl)topEl.classList.add('active');
  }
}


/** Toggle sub-menu under a business menu item */
function toggleSubMenu(el,tab){
  const sub=document.getElementById('sub-'+tab);
  if(!sub)return;
  // 纯toggle行为：仅切换当前菜单的展开/收起状态，不影响其他菜单
  sub.classList.toggle('open');
  el.classList.toggle('open');
  // Only toggle UI, navigation happens when user clicks a sub-item
}

/** Navigate to a specific tier+tab combination from sidebar sub-item click */
function navTierItem(tab,tier){
  _pageSwitching=true;
  curTab=tab||'projects';curTier=tier||'100万以上';curPage='tier';_drillFilter={status:'',tab:''};CF._filters={};
  localStorage.setItem('curTier',curTier);
  // 同步侧边栏
  _syncSidebar();
  // Show tier page
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-tier')?.classList.add('active');
  renderTier();
  updateYearDockVisibility();
  updateViewDockVisibility();
  setTimeout(function(){ _pageSwitching=false; markOverflow(); },500);
}

/** Navigate to a tier page via sidebar menu (business-function-first) */
function navTierTab(tab){
  // 性能优化：页面切换期间暂停markOverflow，避免强制布局扫描导致卡顿
  _pageSwitching=true;
  // 清理旧DOM，减少布局抖动
  var tc=document.getElementById('tierTabContent');if(tc)tc.innerHTML='';
  var ts=document.getElementById('tierSummary');if(ts)ts.innerHTML='';

  curTab=tab||'projects';curPage='tier';_drillFilter={status:'',tab:''};CF._filters={};

  // Restore last selected tier for this tab, or default to '100万以上'
  const savedTier=localStorage.getItem('curTier')||'100万以上';
  if(!curTier)curTier=savedTier;

  // 同步侧边栏
  _syncSidebar();

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));

  document.getElementById('page-tier').classList.add('active');

  renderTier();

  updateYearDockVisibility();
  updateViewDockVisibility();
  // 性能优化：页面渲染完成后恢复markOverflow，并手动触发一次
  setTimeout(function(){ _pageSwitching=false; markOverflow(); },500);
}

/** Navigate to a specific tier+tab (used by drill-down from dashboard etc.) */
function navTier(tier,tab){
  _pageSwitching=true;
  curTier=tier;curTab=tab||'projects';curPage='tier';_drillFilter={status:'',tab:''};CF._filters={};

  localStorage.setItem('curTier',curTier);

  // 同步侧边栏
  _syncSidebar();

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));

  document.getElementById('page-tier').classList.add('active');

  renderTier();

  updateYearDockVisibility();
  updateViewDockVisibility();
  setTimeout(function(){ _pageSwitching=false; markOverflow(); },500);
}

/** Drill-down from delayed Top5 to tier's node page with project ID pre-filled */

function navTierNodeByProject(tier,projectId){

  curTier=tier;curTab='nodes';curPage='tier';_drillFilter={status:'',tab:''};CF._filters={};

  localStorage.setItem('curTier',curTier);

  // 同步侧边栏
  _syncSidebar();

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));

  document.getElementById('page-tier').classList.add('active');

  renderTier();

  updateYearDockVisibility();
  updateViewDockVisibility();

  setTimeout(()=>{const searchEl=document.getElementById('nSearch');const statusEl=document.getElementById('nStatus');if(searchEl){searchEl.value=projectId}if(statusEl){statusEl.value='延期'}filterNodes()},50);

}

/** Navigate to tier nodes page with project ID filter only (no status filter), used by calendar drill-down */
function navCalNodeByProject(tier,projectId){

  curTier=tier;curTab='nodes';curPage='tier';_drillFilter={status:'',tab:''};CF._filters={};

  localStorage.setItem('curTier',curTier);

  // 同步侧边栏
  _syncSidebar();

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));

  document.getElementById('page-tier').classList.add('active');

  renderTier();

  updateYearDockVisibility();
  updateViewDockVisibility();

  setTimeout(()=>{const searchEl=document.getElementById('nSearch');if(searchEl){searchEl.value=projectId}filterNodes()},50);

}

function navTierDrill(tier,tab,statusFilter){
  _pageSwitching=true;
  curTier=tier;curTab=tab||'plan';curPage='tier';CF._filters={};

  localStorage.setItem('curTier',curTier);

  _drillFilter={status:statusFilter||'',tab:tab||'plan',filterYear:filterYear};

  // 同步侧边栏
  _syncSidebar();

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));

  document.getElementById('page-tier').classList.add('active');

  renderTier();

  updateYearDockVisibility();
  updateViewDockVisibility();
  setTimeout(function(){ _pageSwitching=false; markOverflow(); },500);
}



// === Dashboard Summary ===

function renderDashSummary(){

  const el=document.getElementById('dashSummaryCards');

  if(!el)return;

  // 统一使用getFilteredNodes()获取数据，确保视角过滤（L4/PM）在所有周期下均生效
  // 原逻辑在filterYear==='all'时直接取D.rawNodes绕过视角过滤，导致"全部"周期下切换视角不联动
  const allNodes=getFilteredNodes();

  const allProjs=groupByProject(allNodes);

  // 项目总数改为验收日期表的项目数（与Treemap一致，过滤纳管=否 + L4/PM视角）
  const overviewProjects = (D.projectOverview && D.projectOverview.projects) ? D.projectOverview.projects : [];
  const totalProjects = overviewProjects.filter(function(p){
    if(_naguanOn && D.naguanExclude && D.naguanExclude[p.projectId]) return false;
    if(_viewMode==='l4'&&_viewL4&&p.项目经理L4部门!==_viewL4) return false;
    if(_viewMode==='pm'&&_viewPM&&p.项目经理!==_viewPM) return false;
    return true;
  }).length;

  // 计算回款节点数（关联回款的节点数量），用于展示"回款节点数 / 项目总数"
  const relatedNodes=allNodes.filter(n=>n.isPaymentRelated);
  const relatedNodeCount=relatedNodes.length;

  const totalAmountAll=allProjs.reduce((s,p)=>s+(p.projectAmount||0),0);

  const totalAmountWan=totalAmountAll;

  const totalExpectedAll=allProjs.reduce((s,p)=>s+(p.expectedPayment||0),0);

  const totalActualAll=allProjs.reduce((s,p)=>s+(p.actualPayment||0),0);

  const totalRemainingAll=totalExpectedAll-totalActualAll;

  const totalRemainingWan=totalRemainingAll;

  const totalActualWan=totalActualAll;

  const totalExpectedWan=totalExpectedAll;

  const rate=totalExpectedWan>0?totalActualWan/totalExpectedWan:0;

  const rc=rate>=0.8?'var(--green)':rate>=0.5?'var(--orange)':'var(--red)';

  el.innerHTML=`<div class="ds-card"><div class="ds-icon" style="background:var(--primary-50);color:var(--primary)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div><div class="ds-info"><div class="ds-value" style="color:var(--dark)">${relatedNodeCount} / ${totalProjects}</div><div class="ds-label">回款节点数 / 项目总数</div></div></div>

    <div class="ds-card"><div class="ds-icon" style="background:var(--blue-50);color:var(--blue)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div><div class="ds-info"><div class="ds-value" style="color:var(--blue)">${fmtWan(totalExpectedAll)}</div><div class="ds-label">计划回款总金额(万)</div></div></div>

    <div class="ds-card"><div class="ds-icon" style="background:var(--green-50);color:var(--green)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="ds-info"><div class="ds-value" style="color:var(--green)">${fmtWan(totalActualAll)}</div><div class="ds-label">已回款总合计(万)</div></div></div>

    <div class="ds-card"><div class="ds-icon" style="background:var(--red-50);color:var(--red)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="ds-info"><div class="ds-value" style="color:var(--red)">${fmtWan(totalRemainingAll)}</div><div class="ds-label">待回款总金额(万)</div></div></div>

    <div class="ds-card"><div class="ds-icon" style="background:${rate>=0.8?'var(--green-50)':rate>=0.5?'var(--orange-50)':'var(--red-50)'};color:${rc}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg></div><div class="ds-info"><div class="ds-value" style="color:${rc}">${pct(rate)}</div><div class="ds-label">总完成率</div></div></div>`;

}



// === Dashboard ===

function initDash(){

  document.getElementById('updateTime').textContent=D.meta.lastUpdate||'-';

  try{renderDashTopCharts()}catch(e){console.error('renderDashTopCharts error:',e)}
  try{renderDashSummary()}catch(e){console.error('renderDashSummary error:',e)}

  try{renderYearSwitch()}catch(e){console.error('renderYearSwitch error:',e)}
  try{renderViewDock()}catch(e){console.error('renderViewDock error:',e)}

  try{renderTierCards()}catch(e){console.error('renderTierCards error:',e);document.getElementById('tierCards').innerHTML='<div style="color:red;padding:20px">卡片渲染错误: '+e.message+'</div>'}

  try{renderQuarterly()}catch(e){console.error('renderQuarterly error:',e)}

  try{renderMonthly()}catch(e){console.error('renderMonthly error:',e)}

  try{renderRank()}catch(e){console.error('renderRank error:',e)}

  try{renderDelayed()}catch(e){console.error('renderDelayed error:',e)}

  try{updateBadges()}catch(e){console.error('updateBadges error:',e)}

}

function updateBadges(){

  // Per-tier 延期 badges — use filtered nodes (respects naguan/year/view filters)
  var allFiltered=getFilteredNodes().filter(function(n){return n.isPaymentRelated&&n.nodeStatus==='延期';});
  var tiers=[{id:'badgePlan100',tier:'100万以上'},{id:'badgePlan50',tier:'50-100万'},{id:'badgePlan0',tier:'50万以下'}];
  tiers.forEach(function(t){
    var count=allFiltered.filter(function(n){return n.tier===t.tier;}).length;
    var el=document.getElementById(t.id);
    if(el){if(count>0){el.textContent=count+'个延期';el.style.display=''}else{el.style.display='none'}}
  });

  // Also re-render tier tabs if on tier page (to update per-tier badges)
  
}

function showTierDetail(tier){

  const nodes=tierNodes(tier);

  const projs=groupByProject(nodes);

  const totalAmt=projs.reduce((s,p)=>s+(p.projectAmount||0),0);

  const totalRem=projs.reduce((s,p)=>s+(p.remainingAmount||0),0);

  const el=document.getElementById('monthDetailModal');

  el.innerHTML=`<div class="modal-mask" onclick="this.parentElement.innerHTML=''"><div class="modal-box" onclick="event.stopPropagation()">

    <div class="modal-header"><span>${tier}项目详情</span><span class="modal-close" onclick="this.closest('#monthDetailModal').innerHTML=''">&#10005;</span></div>

    <div class="modal-summary">共 ${projs.length} 个项目，计划回款总金额 ${fmtWan(totalAmt)}万，待回款 ${fmtWan(totalRem)}万</div>

    <div class="modal-table-wrap"><table class="data-table"><thead><tr><th>项目编号</th><th>项目名称</th><th>服务组</th><th style="text-align:right">项目金额(元)</th><th style="text-align:right">待回款金额(元)</th><th>状态</th></tr></thead><tbody>

    ${projs.sort((a,b)=>(b.remainingAmount||0)-(a.remainingAmount||0)).slice(0,100).map(p=>{const bc=p.paymentStatus==='延期'?'badge-red':p.paymentStatus==='加资源可提前'?'badge-purple':p.paymentStatus==='已提前回款'?'badge-green':p.paymentStatus==='已全额回款'?'badge-emerald':p.paymentStatus==='正常实施中'?'badge-blue':p.paymentStatus==='达到回款条件'?'badge-amber':'badge-gray';const rw=(p.remainingAmount||0);return `<tr><td class="td-project-id">${p.projectId}</td><td class="td-project-name" title="${p.projectName}">${truncName(p.projectName)}</td><td>${p.orgL4||'-'}</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700">${fmtYuan(p.projectAmount)}</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:${rw>0?'var(--red)':'var(--green)'}">${fmtYuan(rw)}</td><td><span class="badge ${bc}">${p.paymentStatus}</span></td></tr>`}).join('')}

    </tbody></table></div>

  </div></div>`;

}

/** Render year switch options in sidebar dock */

function renderYearSwitch(){

  const el=document.getElementById('yearDockOptions');

  if(!el)return;

  const opts=clockService.getYearOptions();

  const fy=filterYear||'all';

  // Build hierarchical HTML: 全部 → 本年度 → 下一年度 → 至本年度 → 至下一年度
  const y=clockService.getCurrentYear();
  const groups=[
    {key:'all',label:'全部',quarters:[]},
    {key:String(y),label:'本年度',quarters:['Q1','Q2','Q3','Q4'],mode:'range'},
    {key:String(y+1),label:'下一年度',quarters:['Q1','Q2','Q3','Q4'],mode:'range'},
    {key:'upto'+String(y),label:'至本年度',quarters:['Q1','Q2','Q3','Q4'],mode:'cumulative'},
    {key:'upto'+String(y+1),label:'至下一年度',quarters:['Q1','Q2','Q3','Q4'],mode:'cumulative'}
  ];

  var html='';
  groups.forEach(function(g){
    var isActive=fy===g.key;
    var quarterActive=g.quarters.some(function(q){return fy===g.key+'-'+q});
    html+='<div class="yd-group'+(quarterActive?' yd-group-active':'')+'">';
    html+='<div class="yd-year'+(isActive&&!quarterActive?' active':'')+(g.quarters.length?' yd-has-quarters':'')+'" onclick="switchYear(\''+g.key+'\')">'+g.label+'</div>';
    if(g.quarters.length){
      html+='<div class="yd-quarters">';
      g.quarters.forEach(function(q){
        var qk=g.key+'-'+q;
        var qActive=fy===qk;
        html+='<div class="yd-q'+(qActive?' active':'')+'" onclick="event.stopPropagation();switchYear(\''+qk+'\')">'+q+'</div>';
      });
      html+='</div>';
    }
    html+='</div>';
  });

  el.innerHTML=html;

  // Update tab text
  const tabText=document.getElementById('yearDockTabText');

  if(tabText){
    if(fy==='all'){
      tabText.innerHTML='周期切换';
    }else{
      const cur=opts.find(o=>o.key===fy);
      if(cur&&cur.key.indexOf('-Q')>=0){
        tabText.innerHTML=cur.label.replace(/年/,'');
      }else{
        tabText.innerHTML=(cur?cur.label:'周期切换');
      }
    }
  }

}

/** Toggle year dock panel expand/collapse */

function toggleYearDock(){

  const dock=document.getElementById('yearDock');

  if(!dock)return;

  dock.classList.toggle('expanded');

}

// === View Dock (视角切换器) ===

/** Toggle view dock panel expand/collapse */
function toggleViewDock(e){
  const dock=document.getElementById('viewDock');
  if(!dock)return;
  if(e)e.stopPropagation();
  // Toggle expanded state (same pattern as toggleYearDock)
  dock.classList.toggle('expanded');
}

/** Render view dock options based on current _viewMode */
function renderViewDock(){
  const el=document.getElementById('viewDockOptions');
  if(!el)return;

  // null/undefined guard: D.rawNodes may not be loaded yet
  var _frn=_filteredRawNodes();if(!_frn||!_frn.length){el.innerHTML='';return}

  var modes=[
    {key:'global',label:'全局视角'},
    {key:'l4',label:'L4服务组视角'},
    {key:'pm',label:'项目经理视角'}
  ];

  var html='';
  modes.forEach(function(m){
    var isActive=_viewMode===m.key;
    html+='<div class="view-dock-mode-btn'+(isActive?' active':'')+'" onclick="event.stopPropagation();switchView(\''+m.key+'\')">'+m.label+'</div>';
  });

  el.innerHTML=html;


  // Update tab text (no arrow for vertical tab layout, like yearDock)
  var tabText=document.getElementById('viewDockTabText');
  if(tabText){
    if(_viewMode==='global'){
      tabText.innerHTML='视角切换';
    }else if(_viewMode==='l4'){
      tabText.innerHTML=(_viewL4||'L4视角');
    }else if(_viewMode==='pm'){
      tabText.innerHTML=(_viewPM||'PM视角');
    }
  }
}

/** Render PM name list filtered by search input */
function renderViewDockPMList(){
  var el=document.getElementById('viewDockPMList');
  if(!el)return;

  // null/undefined guard
  var _frn=_filteredRawNodes();if(!_frn||!_frn.length){el.innerHTML='';return}

  var q=(document.getElementById('viewDockPMInput')?.value||'').toLowerCase().trim();

  // Collect unique PM names
  var pmSet=new Set();
  D.rawNodes.forEach(function(n){if(n.projectManager&&n.projectManager.trim())pmSet.add(n.projectManager.trim())});
  var pmList=Array.from(pmSet).sort();

  // Filter by search query
  if(q){
    pmList=pmList.filter(function(name){return name.toLowerCase().includes(q)});
  }

  // Limit to 30 items for performance
  pmList=pmList.slice(0,30);

  var html='';
  pmList.forEach(function(name){
    var isActive=_viewPM===name;
    html+='<div class="view-dock-pm-item'+(isActive?' active':'')+'" onclick="event.stopPropagation();switchViewPM(\''+name.replace(/'/g,"\\'")+'\')">'+name+'</div>';
  });

  if(pmList.length===0&&q){
    html='<div style="font-size:11px;color:var(--gray);text-align:center;padding:6px">无匹配结果</div>';
  }

  el.innerHTML=html;
}

/** Switch view mode (global/l4/pm) and refresh all views */
function switchView(mode){
  // null/undefined/empty guard
  if(!mode)mode='global';

  _viewMode=mode;
  _viewL4='';
  _viewPM='';

  // Clear PM search input
  var pmInput=document.getElementById('viewDockPMInput');
  if(pmInput)pmInput.value='';

  // For l4 and pm modes, open sub-panel (二级面板) instead of drawer
  // Only open the sub-panel, do NOT refresh page data (user hasn't selected specific entity yet)
  if(mode==='l4'){
    openSubPanel('l4');
    renderViewDock();
    return;
  } else if(mode==='pm'){
    openSubPanel('pm');
    renderViewDock();
    return;
  } else {
    // Close sub-panel when switching to global
    closeSubPanel();
  }

  renderViewDock();

  // Do NOT collapse dock after mode selection - user needs to select specific L4/PM
  // Dock will collapse only when a specific entity (L4 dept or PM name) is selected

  // Re-render dashboard views with new perspective
  renderDashSummary();
  renderTierCards();
  renderQuarterly();
  renderMonthly();
  renderRank();
  renderDelayed();
  window._refreshDashTopCharts();
  updateBadges();

  // Refresh current page data
  if(curPage==='tier'){renderTier();}
  if(curPage==='followup'){initFollowup();}
  if(curPage==='ledger'){initLedger();}
  if(curPage==='calendar'){initCalendarPage();}
}

/** Switch L4 department within L4 perspective */
function switchViewL4(dept){
  // null/undefined guard
  if(!dept){_viewL4='';_viewMode='global';switchView('global');return}

  _viewL4=dept;

  // Collapse dock and close sub-panel after selecting specific L4 entity
  var dock=document.getElementById('viewDock');
  if(dock)dock.classList.remove('expanded');
  closeSubPanel();

  renderViewDock();

  // Re-render dashboard views with new perspective
  renderDashSummary();
  renderTierCards();
  renderQuarterly();
  renderMonthly();
  renderRank();
  renderDelayed();
  window._refreshDashTopCharts();
  updateBadges();

  // 修复：当当前页面是 tier 页面（回款节点/回款状态等）时，也需要刷新数据
  if(curPage==='tier'){renderTier();}
  if(curPage==='followup'){initFollowup();}
  if(curPage==='ledger'){initLedger();}
  if(curPage==='calendar'){initCalendarPage();}
}

/** Switch PM name within PM perspective */
function switchViewPM(pmName){
  // null/undefined guard
  if(!pmName){_viewPM='';_viewMode='global';switchView('global');return}

  _viewPM=pmName;

  // Collapse dock and close sub-panel after selecting specific PM entity
  var dock=document.getElementById('viewDock');
  if(dock)dock.classList.remove('expanded');
  closeSubPanel();

  renderViewDock();

  // Re-render dashboard views with new perspective
  renderDashSummary();
  renderTierCards();
  renderQuarterly();
  renderMonthly();
  renderRank();
  renderDelayed();
  window._refreshDashTopCharts();
  updateBadges();

  // 修复：当当前页面是 tier 页面（回款节点/回款状态等）时，也需要刷新数据
  if(curPage==='tier'){
    renderTier();
  }
}

/** Show/hide view dock based on current page */
function updateViewDockVisibility(){
  const dock=document.getElementById('viewDock');
  if(!dock)return;
  // 在看板首页、回款节点页面和回款状态页面显示视角切换组件
  var show=curPage==='dashboard'||curPage==='followup'||curPage==='ledger'||(curPage==='tier'&&curTab==='nodes')||(curPage==='tier'&&curTab==='plan');
  if(show){dock.classList.remove('hidden')}else{dock.classList.add('hidden')}
}

/** View dock position is controlled by CSS (top: calc(var(--header-h) + 98px))
    Do NOT override with inline style - let CSS handle the fixed positioning.
    视角切换组件位于周期切换下方，垂直间距为1个汉字高度（14px） */
function positionViewDock(){
  // CSS handles positioning: .view-dock { top: calc(var(--header-h) + 98px); }
  // No dynamic repositioning needed - positions are fixed by CSS
}

/** Show/hide year dock based on current page - only visible on dashboard and plan tab */

function updateYearDockVisibility(){

  const dock=document.getElementById('yearDock');

  if(!dock)return;

  // 修复：仅在看板首页和回款节点页面显示周期切换组件
  const show=curPage==='dashboard'||curPage==='followup'||curPage==='ledger'||(curPage==='tier'&&(curTab==='plan'||curTab==='nodes'));

  if(show){dock.classList.remove('hidden')}else{dock.classList.add('hidden')}

  positionYearDock();

}

/** Year dock position is controlled by CSS (top: calc(var(--header-h) + 24px))
    Do NOT override with inline style - let CSS handle the fixed positioning.
    周期切换组件位置由CSS固定定义，不再动态跟随页面元素 */
function positionYearDock(){
  // CSS handles positioning: .year-dock { top: calc(var(--header-h) + 24px); }
  // No dynamic repositioning needed - position is fixed by CSS
}

/** Switch year filter and re-render all views */

function switchYear(year){

  // null/undefined/empty guard
  if(!year)year='all';

  filterYear=year;

  renderYearSwitch();

  // Collapse dock after selection
  const dock=document.getElementById('yearDock');

  if(dock)dock.classList.remove('expanded');

  renderDashSummary();
 
  renderTierCards();
 
  renderQuarterly();
 
  renderMonthly();
 
  renderRank();

  renderDelayed();

  window._refreshDashTopCharts();
  updateBadges();

  if(curPage==='tier')renderTier();
  if(curPage==='followup'){initFollowup();}
  if(curPage==='ledger'){initLedger();}
  if(curPage==='calendar'){initCalendarPage();}

}



/** Compute tier stats from filtered nodes */

function computeTierStats(tier,nodes){

  const tierNodes=nodes.filter(n=>n.tier===tier);

  const related=tierNodes.filter(n=>n.isPaymentRelated);

  const pids=new Set(tierNodes.map(n=>n.projectId));

  const projectCount=pids.size;

  const relatedPids=new Set(related.map(n=>n.projectId));

  const relatedProjectCount=relatedPids.size;

  const pa={};tierNodes.forEach(n=>{if(!(n.projectId in pa))pa[n.projectId]=n.projectAmount});

  const totalAmount=Object.values(pa).reduce((s,v)=>s+v,0);

  const totalAmountWan=totalAmount/10000;

  const expectedTotal=related.reduce((s,n)=>s+(n.expectedPayment||0),0);

  const actualTotal=related.reduce((s,n)=>s+(n.actualPayment||0),0);

  const remaining=expectedTotal-actualTotal;

  const remainingAmountWan=remaining/10000;

  const actualAmountWan=actualTotal/10000;

  const expectedAmountWan=expectedTotal/10000;

  // 各状态节点分组
  const canAdvance=related.filter(n=>n.nodeStatus==='加资源可提前');
  const reachedCondition=related.filter(n=>n.nodeStatus==='达到回款条件');
  const advance=related.filter(n=>n.nodeStatus==='已提前回款');
  const fullPaid=related.filter(n=>n.nodeStatus==='已全额回款');
  const onTime=related.filter(n=>n.nodeStatus==='正常实施中');
  const delayed=related.filter(n=>n.nodeStatus==='延期');

  // 辅助函数：计算每个状态的 expected/actual/remaining/rate (单位：元)
  function statusStats(group){
    const exp=group.reduce((s,n)=>s+(n.expectedPayment||0),0);
    const act=group.reduce((s,n)=>s+(n.actualPayment||0),0);
    const rem=exp-act;
    const rate=exp>0?act/exp:0;
    return {expected:exp,actual:act,remaining:rem,rate:rate};
  }

  const canAdvS=statusStats(canAdvance);
  const reachedS=statusStats(reachedCondition);
  const advS=statusStats(advance);
  const fullPaidS=statusStats(fullPaid);
  const onTimeS=statusStats(onTime);
  const delayedS=statusStats(delayed);

  return {

    projectCount, relatedProjectCount, totalAmountWan, actualAmountWan, expectedAmountWan, remainingAmountWan, relatedNodeCount:related.length,

    canAdvanceCount:canAdvance.length,
    canAdvanceExpected:canAdvS.expected/10000,
    canAdvanceActual:canAdvS.actual/10000,
    canAdvanceRemaining:canAdvS.remaining/10000,
    canAdvanceRate:canAdvS.rate,

    reachedConditionCount:reachedCondition.length,
    reachedConditionExpected:reachedS.expected/10000,
    reachedConditionActual:reachedS.actual/10000,
    reachedConditionRemaining:reachedS.remaining/10000,
    reachedConditionRate:reachedS.rate,

    advanceCount:advance.length,
    advanceExpected:advS.expected/10000,
    advanceActual:advS.actual/10000,
    advanceRemaining:advS.remaining/10000,
    advanceRate:advS.rate,

    fullPaidCount:fullPaid.length,
    fullPaidExpected:fullPaidS.expected/10000,
    fullPaidActual:fullPaidS.actual/10000,
    fullPaidRemaining:fullPaidS.remaining/10000,
    fullPaidRate:fullPaidS.rate,

    onTimeCount:onTime.length,
    onTimeExpected:onTimeS.expected/10000,
    onTimeActual:onTimeS.actual/10000,
    onTimeRemaining:onTimeS.remaining/10000,
    onTimeRate:onTimeS.rate,

    delayedCount:delayed.length,
    delayedExpected:delayedS.expected/10000,
    delayedActual:delayedS.actual/10000,
    delayedRemaining:delayedS.remaining/10000,
    delayedRate:delayedS.rate,

    // 兼容旧字段名（供对比页等其他页面使用）
    canAdvanceAmount:canAdvS.expected/10000,
    reachedConditionAmount:reachedS.expected/10000,
    advanceAmount:advS.expected/10000,
    advanceEarlyAmount:advS.expected/10000,
    fullPaidAmount:fullPaidS.actual/10000,
    onTimeAmount:onTimeS.expected/10000,
    delayedAmount:delayedS.expected/10000,
    paidCount:related.filter(n=>pctToNum(n.actualPaymentRatio)!==null&&pctToNum(n.actualPaymentRatio)>=1).length,
    paidAmount:related.filter(n=>pctToNum(n.actualPaymentRatio)!==null&&pctToNum(n.actualPaymentRatio)>=1).reduce((s,n)=>s+(n.actualPayment||0),0)/10000,

  };

}



/** Get filtered nodes by year and perspective */
function getFilteredNodes(){

  // Step 1: Apply perspective filter first
  var baseNodes=D.rawNodes;
  if(_viewMode==='l4'&&_viewL4)baseNodes=baseNodes.filter(function(n){return n.orgL4===_viewL4});
  if(_viewMode==='pm'&&_viewPM)baseNodes=baseNodes.filter(function(n){return n.projectManager===_viewPM});

  // Step 1.5: Apply 纳管 filter (system-wide) — exclude only naguan='否'
  if(_naguanOn && D.naguanExclude){
    baseNodes=baseNodes.filter(function(n){return !D.naguanExclude[n.projectId];});
  }

  if(filterYear==='all')return baseNodes;

  // Quarterly range filter: e.g. 2026-Q1 -> planMonth in [2026-01, 2026-03]
  // Also handles upto2026-Q1 -> cumulative up to end of that quarter
  if(filterYear.indexOf('-Q')>=0){
    var qMap={'Q1':['01','03'],'Q2':['04','06'],'Q3':['07','09'],'Q4':['10','12']};
    // Check if this is a cumulative quarter (e.g. upto2026-Q1)
    var isUptoQuarter=filterYear.indexOf('upto')===0;
    var keyPart=isUptoQuarter?filterYear.substring(4):filterYear; // remove 'upto' prefix
    var parts=keyPart.split('-Q');
    var qYear=parts[0],qNum='Q'+parts[1];
    var range=qMap[qNum];
    if(!range)return baseNodes;
    var mStart=qYear+'-'+range[0];
    var mEnd=qYear+'-'+range[1];
    // 季度过滤：精确到指定季度范围（upto 季度与普通季度行为一致）
    return baseNodes.filter(function(n){return n.planMonth&&n.planMonth>=mStart&&n.planMonth<=mEnd});
  }

  // Cumulative year filter: upto2026 -> show all nodes with planMonth <= 2026-12
  if(filterYear.indexOf('upto')===0){
    var yearStr=filterYear.substring(4); // remove 'upto' prefix
    var endOfYear=yearStr+'-12';
    return baseNodes.filter(n=>n.planMonth&&n.planMonth<=endOfYear);
  }

  // Range year filter: 2026 -> show nodes with planMonth in [2026-01, 2026-12] only
  var startOfYear=filterYear+'-01';
  var endOfYear2=filterYear+'-12';
  return baseNodes.filter(n=>n.planMonth&&n.planMonth>=startOfYear&&n.planMonth<=endOfYear2);

}



function renderTierCards(){

  const filtered=getFilteredNodes();

  const tiers=[{key:'100万以上',accent:'accent-red',badge:'badge-tier-red'},{key:'50-100万',accent:'accent-orange',badge:'badge-tier-orange'},{key:'50万以下',accent:'accent-green',badge:'badge-tier-green'}];

  document.getElementById('tierCards').innerHTML=tiers.map(t=>{

    // 统一使用computeTierStats计算，确保与子看板数据一致
    const s=computeTierStats(t.key,filtered);

    const tierActualWan=s.actualAmountWan;

    function statusRow(label,color,count,actualWan,remainingWan,rate,statusKey){

      const ratePct=rate*100;

      const rateColor=ratePct>=80?'var(--green)':ratePct>=50?'var(--orange)':'var(--red)';

      return `<div class="tc-status-row tc-drillable" style="cursor:pointer" onclick="event.stopPropagation();navTierDrill('${t.key}','plan','${statusKey}')">

        <span class="tc-status-label" style="background:${color}20;color:${color}">${label}</span>

        <span class="tc-status-val">${count||0}</span>

        <span class="tc-status-val">${fmtYuan(actualWan)}</span>

        <span class="tc-status-val" style="color:${remainingWan>0.005?'var(--red)':'var(--green)'}">${fmtYuan(remainingWan)}</span>

        <span class="tc-status-val" style="color:${rateColor}">${ratePct.toFixed(1)}%</span>

      </div>`;

    }

    return `<div class="tier-card" onclick="showTierDetail('${t.key}')">

      <div class="tier-card-accent ${t.accent}"></div>

      <div class="tc-row1">

        <span class="tc-title">${t.key}项目</span>

        <a class="tc-link" onclick="event.stopPropagation();navTier('${t.key}','projects')">进入详情 →</a>

      </div>

      <div class="tc-row2">

        <div class="tc-big-metric tc-drillable" onclick="event.stopPropagation();navTier('${t.key}','nodes')"><div class="tc-big-label">已回款合计(万)</div><div class="tc-big-value" style="color:var(--green)">${fmtYuan(tierActualWan)}</div></div>

        <div class="tc-big-metric tc-drillable" onclick="event.stopPropagation();navTier('${t.key}','plan')"><div class="tc-big-label">待回款合计(万)</div><div class="tc-big-value" style="color:var(--red)">${fmtYuan(s.remainingAmountWan)}</div></div>

      </div>

      <div class="tc-row3">

        <div class="tc-sm-metric tc-drillable" onclick="event.stopPropagation();navTier('${t.key}','nodes')"><span class="tc-sm-label">回款节点数 / 项目总数</span><span class="tc-sm-value">${s.relatedNodeCount||0} / ${s.projectCount||0}</span></div>

        <div class="tc-sm-metric tc-drillable" onclick="event.stopPropagation();navTier('${t.key}','nodes')"><span class="tc-sm-label">完成率</span><span class="tc-sm-value" style="color:${(s.actualAmountWan&&s.expectedAmountWan&&s.expectedAmountWan>0)?(s.actualAmountWan/s.expectedAmountWan>=0.8?'var(--green)':s.actualAmountWan/s.expectedAmountWan>=0.5?'var(--orange)':'var(--red)'):'var(--gray)'}">${(s.actualAmountWan&&s.expectedAmountWan&&s.expectedAmountWan>0)?(s.actualAmountWan/s.expectedAmountWan*100).toFixed(1)+'%':'-'}</span></div>

      </div>

      <div class="tc-row-header">

        <span class="tc-h-label">状态</span><span class="tc-h-col">节点数</span><span class="tc-h-col">已回款(万)</span><span class="tc-h-col">待回款(万)</span><span class="tc-h-col">完成率</span>

      </div>

      ${statusRow('加资源可提前','#6366F1',s.canAdvanceCount,s.canAdvanceActual,s.canAdvanceRemaining,s.canAdvanceRate,'canAdvance')}

      ${statusRow('达到回款条件','#F59E0B',s.reachedConditionCount,s.reachedConditionActual,s.reachedConditionRemaining,s.reachedConditionRate,'reachedCondition')}

      ${statusRow('已提前回款','#059669',s.advanceCount,s.advanceActual,s.advanceRemaining,s.advanceRate,'advance')}

      ${statusRow('已全额回款','#10B981',s.fullPaidCount,s.fullPaidActual,s.fullPaidRemaining,s.fullPaidRate,'fullPaid')}

      ${statusRow('延期','#EF4444',s.delayedCount,s.delayedActual,s.delayedRemaining,s.delayedRate,'delayed')}

      ${statusRow('正常实施中','#3B82F6',s.onTimeCount,s.onTimeActual,s.onTimeRemaining,s.onTimeRate,'onTime')}

    </div>`;

  }).join('');

}

function renderQuarterly(){
  var chartDom=document.getElementById('quarterlyChart');
  if(!chartDom)return;
  // 先销毁旧实例
  try{echarts.getInstanceByDom(chartDom)?.dispose()}catch(e){}
  // 清除旧尺寸，避免残留
  chartDom.style.width='';chartDom.style.minWidth='';chartDom.style.maxWidth='';
  var nodes=getFilteredNodes().filter(function(n){return n.isPaymentRelated&&(pctToNum(n.actualPaymentRatio)===null||pctToNum(n.actualPaymentRatio)<1)});
  var quarters={}, tiers=['100万以上','50-100万','50万以下'];
  tiers.forEach(function(t){quarters[t]={}});
  nodes.forEach(function(n){
    var m=n.planMonth;if(!m)return;
    var parts=m.split('-');var y=parts[0],mo=parseInt(parts[1],10);var q='';
    if(mo>=1&&mo<=3)q=y+'-Q1';else if(mo>=4&&mo<=6)q=y+'-Q2';else if(mo>=7&&mo<=9)q=y+'-Q3';else q=y+'-Q4';
    var tier=n.tier;if(!quarters[tier])quarters[tier]={};
    if(!quarters[tier][q])quarters[tier][q]=0;
    quarters[tier][q]+=getNodeRemaining(n)/10000;
  });
  var qsSet={};tiers.forEach(function(t){Object.keys(quarters[t]).forEach(function(q){qsSet[q]=1})});
  // 当选择"本年度"/"下一年度"等具体年份时，补全该年份全部4个季度（无数据的填0）
  if(filterYear!=='all'&&filterYear.indexOf('upto')!==0&&filterYear.indexOf('-Q')<0){
    var fy=filterYear;
    ['Q1','Q2','Q3','Q4'].forEach(function(q){var qk=fy+'-'+q;qsSet[qk]=1;tiers.forEach(function(t){if(quarters[t][qk]===undefined)quarters[t][qk]=0})});
  }
  var qs=Object.keys(qsSet).sort();
  // 在 init 之前设置宽度，确保 ECharts 初始化时读到正确尺寸
  _calcChartScroll(chartDom, qs.length);
  // 强制回流，让宽度生效后再初始化
  void chartDom.offsetWidth;
  var ch=echarts.init(chartDom,'ent');
  _cleanCharts();_charts.push(ch);
  ch.setOption({
    tooltip:{trigger:'axis',axisPointer:{type:'shadow',shadowStyle:{width:CHART_AXIS_POINTER_WIDTH}},position:function(point,params,dom,rect,size){var vw=size.viewSize[0],vh=size.viewSize[1],tw=size.contentSize[0],th=size.contentSize[1];var x,y;if(point[0]>vw*0.65){x=point[0]-tw-10}else{x=point[0]+10}if(point[1]+th>vh-10){y=point[1]-th-10}else{y=point[1]}if(y<0)y=point[1]+10;x=Math.max(0,Math.min(x,vw-tw));return[x,y]},formatter:function(p){var s=p[0].axisValue+'<br/>';var t=0;p.forEach(function(x){s+=x.marker+x.seriesName+': '+fmtYuan(x.value)+'万<br/>';t+=x.value});s+='<b>合计: '+fmtYuan(t)+'万</b>';return s}},
    legend:{show:false,data:["100万以上","50-100万","50万以下"]},
    grid:{left:60,right:25,top:25,bottom:25},
    xAxis:{type:'category',data:qs,axisLabel:{fontSize:11,formatter:function(v){var cy=String(new Date().getFullYear());return v&&v.startsWith(cy)?'{cy|'+v+'}':v},rich:{cy:{color:'#6366F1',fontWeight:700,fontSize:11}}}},
    yAxis:{type:'value',name:'金额(万)',nameTextStyle:{color:'#334155',fontWeight:'bold',fontSize:12},nameGap:8},
    series:[
      {name:'100万以上',type:'bar',stack:'a',data:qs.map(function(q){return quarters['100万以上'][q]||0}),itemStyle:{color:'#EF4444'},barWidth:CHART_BAR_WIDTH,barCategoryGap:CHART_BAR_CATEGORY_GAP},
      {name:'50-100万',type:'bar',stack:'a',data:qs.map(function(q){return quarters['50-100万'][q]||0}),itemStyle:{color:'#F59E0B'},barWidth:CHART_BAR_WIDTH},
      {name:'50万以下',type:'bar',stack:'a',data:qs.map(function(q){return quarters['50万以下'][q]||0}),itemStyle:{color:'#10B981',borderRadius:[4,4,0,0]},barWidth:CHART_BAR_WIDTH}
    ]
  });
  _fillChartLegend('quarterlyLegend',[{name:'100万以上',color:'#EF4444'},{name:'50-100万',color:'#F59E0B'},{name:'50万以下',color:'#10B981'}],ch);
  ch.on('click',function(p){
    if(p.componentType==='series'){
      var q=qs[p.dataIndex];
      var qParts=q.split('-Q');var qYear=qParts[0],qNum=parseInt(qParts[1],10);
      var mStart=qYear+'-'+String((qNum-1)*3+1).padStart(2,'0');
      var mEnd=qYear+'-'+String(qNum*3).padStart(2,'0');
      var qNodes=getFilteredNodes().filter(function(n){return n.isPaymentRelated&&n.planMonth&&n.planMonth>=mStart&&n.planMonth<=mEnd&&(pctToNum(n.actualPaymentRatio)===null||pctToNum(n.actualPaymentRatio)<1.0)});
      var drill=buildTierGroupedDrillHtml(qNodes,'planMonth');
      var el=document.getElementById('monthDetailModal');
      el.innerHTML='<div class="modal-mask" onclick="this.parentElement.innerHTML=\'\'"><div class="modal-box" onclick="event.stopPropagation()"><div class="modal-header"><span>'+q+' \u00b7 待回款详情（全部区间）</span><span class="modal-close" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">&#10005;</span></div><div class="modal-summary">共 '+drill.grandCount+' 个节点，待回款合计 '+fmtWan(drill.grandRem)+'万</div><div class="modal-table-wrap"><table class="data-table"><thead><tr><th>项目编号</th><th>项目名称</th><th>金额区间</th><th>节点</th><th>计划月份</th><th style="text-align:right">待回款(元)</th><th>实际比例</th><th>状态</th></tr></thead><tbody>'+drill.rows+'</tbody></table></div></div></div>';
    }
  });
}

function renderMonthly(){

  const chartDom=document.getElementById('monthlyChart');

  if(!chartDom)return;

  try{echarts.getInstanceByDom(chartDom)?.dispose()}catch(e){}
  chartDom.style.width='';chartDom.style.minWidth='';chartDom.style.maxWidth='';

  const ms=new Set(),td={};

    // 修复：统一使用 getFilteredNodes() 实时计算，确保视角切换（L4/PM）后数据正确
  // 原逻辑在 filterYear==='all' 时直接取 D.summary[t].monthlyPlan（全局预计算数据），
  // 导致切换视角后月度图数据不跟随视角过滤
  const filtered=getFilteredNodes().filter(n=>n.isPaymentRelated&&(pctToNum(n.actualPaymentRatio)===null||pctToNum(n.actualPaymentRatio)<1));
  ['100万以上','50-100万','50万以下'].forEach(tier=>{
    const tierNodes=filtered.filter(n=>n.tier===tier);
    const mp={};
    tierNodes.forEach(n=>{
      const m=n.planMonth;
      if(filterYear!=='all'&&!m)return;
      if(filterYear!=='all'&&(m>_getFilterYearEndMonth()||m<_getFilterYearStartMonth()))return;
      if(!mp[m])mp[m]={count:0,amountWan:0};
      mp[m].count++;
      mp[m].amountWan+=getNodeRemaining(n)/10000;
    });
    td[tier]=mp;
    Object.keys(mp).forEach(m=>ms.add(m));
  });

  // 当选择"本年度"/"下一年度"等具体年份时，补全该年份全部12个月（无数据的填0）
  if(filterYear!=='all'&&filterYear.indexOf('upto')!==0&&filterYear.indexOf('-Q')<0){
    var fy=filterYear;
    for(var mo=1;mo<=12;mo++){var mk=fy+'-'+String(mo).padStart(2,'0');ms.add(mk);['100万以上','50-100万','50万以下'].forEach(function(t){if(!td[t])td[t]={};if(!td[t][mk])td[t][mk]={count:0,amountWan:0}})}
  }

  const months=[...ms].sort();
  // 在 init 之前设置宽度，确保 ECharts 读到正确尺寸
  _calcChartScroll(chartDom, months.length);
  // 强制回流
  void chartDom.offsetWidth;
  const ch=echarts.init(chartDom,'ent');
  _cleanCharts();_charts.push(ch);

  ch.setOption({

    tooltip:{trigger:'axis',axisPointer:{type:'shadow',shadowStyle:{width:CHART_AXIS_POINTER_WIDTH}},position:function(point,params,dom,rect,size){var vw=size.viewSize[0],vh=size.viewSize[1],tw=size.contentSize[0],th=size.contentSize[1];var x,y;if(point[0]>vw*0.65){x=point[0]-tw-10}else{x=point[0]+10}if(point[1]+th>vh-10){y=point[1]-th-10}else{y=point[1]}if(y<0)y=point[1]+10;x=Math.max(0,Math.min(x,vw-tw));return[x,y]},formatter:p=>{let s=p[0].axisValue+'<br/>';let t=0;p.forEach(x=>{s+=x.marker+x.seriesName+': '+fmtYuan(x.value)+'万<br/>';t+=x.value});s+='<b>合计: '+fmtYuan(t)+'万</b>';return s}},

    legend:{show:false,data:["100万以上","50-100万","50万以下"]},

    grid:{left:60,right:25,top:25,bottom:25},

    xAxis:{type:'category',data:months,axisLabel:{fontSize:11,formatter:v=>{const cy=new Date().getFullYear();return v&&v.startsWith(cy+'-')?'{cy|'+v+'}':v},rich:{cy:{color:'#6366F1',fontWeight:700,fontSize:11}}}},

    yAxis:{type:'value',name:'金额(万)',nameTextStyle:{color:'#334155',fontWeight:'bold',fontSize:12},nameGap:8},

    series:[

      {name:'100万以上',type:'bar',stack:'a',data:months.map(m=>((td['100万以上']||{})[m]||{}).amountWan||0),itemStyle:{color:'#EF4444'},barWidth:CHART_BAR_WIDTH,barCategoryGap:CHART_BAR_CATEGORY_GAP},

      {name:'50-100万',type:'bar',stack:'a',data:months.map(m=>((td['50-100万']||{})[m]||{}).amountWan||0),itemStyle:{color:'#F59E0B'},barWidth:CHART_BAR_WIDTH},

      {name:'50万以下',type:'bar',stack:'a',data:months.map(m=>((td['50万以下']||{})[m]||{}).amountWan||0),itemStyle:{color:'#10B981',borderRadius:[4,4,0,0]},barWidth:CHART_BAR_WIDTH}

    ]

  });

  _fillChartLegend('monthlyLegend',[{name:'100万以上',color:'#EF4444'},{name:'50-100万',color:'#F59E0B'},{name:'50万以下',color:'#10B981'}],ch);

  ch.on('click',function(p){

    if(p.componentType==='series'){

      const month=months[p.dataIndex];

      const tier=p.seriesName;

      showMonthDetail(month,tier);

    }

  });

}

// Helper: build tier-grouped drill-down table HTML with subtotals and grand total
function buildTierGroupedDrillHtml(nodes,dateField){
  var tiers=['100万以上','50-100万','50万以下'];
  var tierColors={'100万以上':'badge-red','50-100万':'badge-orange','50万以下':'badge-green'};
  var tierBgs={'100万以上':'#FEF2F2','50-100万':'#FFFBEB','50万以下':'#ECFDF5'};
  var tierAccents={'100万以上':'#EF4444','50-100万':'#F59E0B','50万以下':'#10B981'};
  var rows='';var grandCount=0,grandRem=0;
  tiers.forEach(function(t){
    var tn=nodes.filter(function(n){return n.tier===t});
    if(!tn.length)return;
    var subRem=0;tn.forEach(function(n){subRem+=getNodeRemaining(n)});
    grandCount+=tn.length;grandRem+=subRem;
    rows+='<tr style="background:'+tierBgs[t]+'"><td colspan="8" style="font-weight:700;padding:8px 12px;border-left:3px solid '+tierAccents[t]+'"><span class="badge '+tierColors[t]+'">'+t+'</span> <span style="margin-left:8px;color:var(--dark)">'+tn.length+'个节点，待回款小计 '+fmtWan(subRem)+'万</span></td></tr>';
    tn.forEach(function(n){
      var ew=getNodeRemainingWan(n);
      var bc=n.nodeStatus==='延期'?'badge-red':n.nodeStatus==='加资源可提前'?'badge-purple':n.nodeStatus==='已提前回款'?'badge-green':n.nodeStatus==='已全额回款'?'badge-emerald':n.nodeStatus==='正常实施中'?'badge-blue':n.nodeStatus==='达到回款条件'?'badge-amber':'badge-gray';
      var dateVal=dateField==='planMonth'?(n.planMonth||'-'):(n.planDate||'-');
      rows+='<tr><td class="td-project-id">'+n.projectId+'</td><td class="td-project-name" title="'+(n.projectName||'')+'">'+truncName(n.projectName||'')+'</td><td><span class="badge '+tierColors[t]+'">'+t+'</span></td><td>'+(n.milestone||n.stageName||'-')+'</td><td style="font-family:var(--font-mono)">'+dateVal+'</td><td style="text-align:right;font-family:var(--font-mono)">'+fmtYuan(ew)+'</td><td>'+fmtRatio(n.actualPaymentRatio,'待上报')+'</td><td><span class="badge '+bc+'">'+n.nodeStatus+'</span></td></tr>';
    });
  });
  return {rows:rows,grandCount:grandCount,grandRem:grandRem};
}

function showMonthDetail(month,tier){
  // 显示该月所有区间的待回款节点，按tier分组显示小计和合计
  // 修复：过滤条件与 renderMonthly 保持一致，允许 actualPaymentRatio 为 null
  var nodes=getFilteredNodes().filter(function(n){return n.isPaymentRelated&&n.planMonth===month&&(pctToNum(n.actualPaymentRatio)===null||pctToNum(n.actualPaymentRatio)<1)});
  var drill=buildTierGroupedDrillHtml(nodes,'planDate');
  var el=document.getElementById('monthDetailModal');
  el.innerHTML='<div class="modal-mask" onclick="this.parentElement.innerHTML=\'\'"><div class="modal-box" onclick="event.stopPropagation()"><div class="modal-header"><span>'+month+' \u00b7 待回款详情（全部区间）</span><span class="modal-close" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">&#10005;</span></div><div class="modal-summary">共 '+drill.grandCount+' 个节点，待回款合计 '+fmtWan(drill.grandRem)+'万</div><div class="modal-table-wrap"><table class="data-table"><thead><tr><th>项目编号</th><th>项目名称</th><th>金额区间</th><th>节点</th><th>计划日期</th><th style="text-align:right">待回款(元)</th><th>实际比例</th><th>状态</th></tr></thead><tbody>'+drill.rows+'</tbody></table></div></div></div>';
}
function renderRank(){

  // 动态计算：从getFilteredNodes()获取数据，按orgL4分组统计，与周期切换联动
  var nodes=getFilteredNodes().filter(function(n){return n.isPaymentRelated});
  var tierFilter=document.getElementById('rankTier')?document.getElementById('rankTier').value:'';
  if(tierFilter)nodes=nodes.filter(function(n){return n.tier===tierFilter});

  // 按orgL4分组
  var orgMap={};
  nodes.forEach(function(n){
    var org=n.orgL4||'未指定';
    if(!orgMap[org])orgMap[org]={org:org,expectedTotal:0,actualTotal:0};
    orgMap[org].expectedTotal+=(n.expectedPayment||0);
    orgMap[org].actualTotal+=(n.actualPayment||0);
  });

  var orgList=Object.values(orgMap).map(function(o){
    o.achievementRate=o.expectedTotal>0?o.actualTotal/o.expectedTotal:0;
    o.actualTotalWan=o.actualTotal/10000;
    return o;
  });

  var sb=document.getElementById('rankSort')?document.getElementById('rankSort').value:'actualTotal';
  var sorted=[].concat(orgList).sort(function(a,b){return b[sb]-a[sb]});
  var mx=Math.max.apply(null,sorted.map(function(s){return s.actualTotal}).concat([1]));

  document.getElementById('orgRanking').innerHTML=sorted.slice(0,15).map(function(v,i){
    var medal=i===0?'<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#FFD700;color:#fff;font-size:12px;font-weight:700">1</span>':i===1?'<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#C0C0C0;color:#fff;font-size:12px;font-weight:700">2</span>':i===2?'<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#CD7F32;color:#fff;font-size:12px;font-weight:700">3</span>':'';
    var rank=medal||(i+1);
    var bw=(v.actualTotal/mx*100).toFixed(1);
    var bc=v.achievementRate>=.45?'linear-gradient(90deg,#10B981,#34D399)':v.achievementRate>=.3?'linear-gradient(90deg,#F59E0B,#FBBF24)':'linear-gradient(90deg,#EF4444,#F87171)';
    var rc=v.achievementRate>=.45?'var(--green)':v.achievementRate>=.3?'var(--orange)':'var(--red)';
    return '<div class="rank-item"><div class="rank-badge">'+rank+'</div><div class="rank-name" title="'+v.org+'">'+(v.org.length>8?v.org.slice(0,8)+'…':v.org)+'</div><div class="rank-bar-wrap"><div class="rank-bar" style="width:'+bw+'%;background:'+bc+'"></div></div><div class="rank-amount">'+fmtW(v.actualTotalWan)+'</div><div class="rank-rate" style="color:'+rc+'">'+pct(v.achievementRate)+'</div></div>';
  }).join('');

}

document.getElementById('rankSort')?.addEventListener('change',renderRank);
document.getElementById('rankTier')?.addEventListener('change',renderRank);

function renderDelayed(){
  /* 边界条件：□ null/undefined(el) □ 空集合(D.rawNodes为空) □ 类型错误(节点字段缺失) □ 超长输入(项目名过长由escAttr处理) □ 并发调用不适用 */
  var el=document.getElementById('delayedTop');
  if(!el)return;

  // 使用getFilteredNodes()获取数据，确保与视角切换（L4/PM）和周期切换联动
  var allNodes=getFilteredNodes();
  var projs=groupByProject(allNodes);

  // 筛选延期项目
  var delayedProjs=projs.filter(function(p){return p.paymentStatus==='延期'});

  // 按延期天数降序排列（取项目下所有节点的最大delayDays）
  delayedProjs.sort(function(a,b){
    var maxA=0,maxB=0;
    a.nodes.forEach(function(n){if(n.delayDays&&n.delayDays>maxA)maxA=n.delayDays});
    b.nodes.forEach(function(n){if(n.delayDays&&n.delayDays>maxB)maxB=n.delayDays});
    return maxB-maxA;
  });

  // 取Top10
  var d=delayedProjs.slice(0,10);

  if(!d.length){el.innerHTML='<div style="color:var(--gray);text-align:center;padding:20px">暂无延期项目</div>';return}

  el.innerHTML=d.map(function(p){
    var tierBadge=p.tier==='100万以上'?'badge-red':p.tier==='50-100万'?'badge-orange':'badge-green';
    var maxDelay=0;
    p.nodes.forEach(function(n){if(n.delayDays&&n.delayDays>maxDelay)maxDelay=n.delayDays});
    return '<div style="padding:10px 12px;border:1px solid var(--border-light);border-radius:var(--radius-sm);margin-bottom:8px;cursor:pointer;transition:all .15s;background:#fff" onclick="navTierNodeByProject(\''+p.tier+'\',\''+p.projectId+'\')" onmouseenter="this.style.borderColor=\'var(--primary)\';this.style.boxShadow=\'0 2px 8px rgba(99,102,241,.1)\'" onmouseleave="this.style.borderColor=\'var(--border-light)\';this.style.boxShadow=\'none\'" title="点击查看该项目回款节点">\
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">\
        <span style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:var(--dark)">'+p.projectId+'</span>\
        <span style="color:var(--red);font-weight:800;font-family:var(--font-mono);font-size:15px">'+maxDelay+'<span style="font-size:11px;font-weight:500;margin-left:2px">天</span></span>\
      </div>\
      <div style="font-size:13px;color:var(--dark-3);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+escAttr(p.projectName||'')+'">'+(p.projectName||'-')+'</div>\
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--gray)">\
        <span>'+(p.orgL4||'-')+'</span>\
        <span class="badge '+tierBadge+'" style="font-size:11px">'+p.tier+'</span>\
      </div>\
    </div>';
  }).join('')+'<div class="table-record-count">共 '+d.length+' 条记录</div>';

}

function switchTier(tier){
  curTier=tier;
  localStorage.setItem('curTier',curTier);
  renderTier();
}

function renderTier(){

  // Ensure curTier has a valid value
  if(!curTier)curTier=localStorage.getItem('curTier')||'100万以上';


  const s=D.summary[curTier]||{};

  const nodes=tierNodes(curTier);

  const projs=groupByProject(nodes);

  // 修复：下钻统计使用过滤后数据计算，而非 D.summary（全局预计算），确保视角切换后数据正确
  const tierProjectCount=projs.length;
  const tierRelatedNodeCount=nodes.filter(n=>n.isPaymentRelated).length;

  const totalActual=projs.reduce((s,p)=>s+(p.actualPayment||0),0);

  const totalExpected=projs.reduce((s,p)=>s+(p.expectedPayment||0),0);

  const pr=totalExpected>0?totalActual/totalExpected:0;

  // Only show page-specific dashboard for projects tab

  const summaryEl=document.getElementById('tierSummary');

  if(curTab==='projects'||curTab==='nodes'){

    const projCanAdv=projs.filter(p=>p.paymentStatus==='加资源可提前').length;

    const projReachedCond=projs.filter(p=>p.paymentStatus==='达到回款条件').length;

    const projDelayed=projs.filter(p=>p.paymentStatus==='延期').length;

    
    const projPaid100=projs.filter(p=>p.paymentRatio!==null&&p.paymentRatio>=1).length;

    const totalActW=totalActual;

    const totalRemW=(totalExpected-totalActual);

    summaryEl.innerHTML=`

    <div class="summary-item" id="tierSummaryFirstCard"><div class="label">${curTab==='nodes'?'回款节点数':'项目总数'}</div><div class="value" style="color:var(--dark)">${curTab==='nodes'?tierRelatedNodeCount:tierProjectCount}</div></div>

<div class="summary-item"><div class="label">已回款总金额(万)</div><div class="value" style="color:var(--green)">${fmtWan(totalActW)}</div></div>

<div class="summary-item"><div class="label">待回款总金额(万)</div><div class="value" style="color:var(--red)">${fmtWan(totalRemW)}</div></div>

    <div class="summary-item"><div class="label">完成率</div><div class="value" style="color:${pr>=0.8?'var(--green)':pr>=0.5?'var(--orange)':'var(--red)'}">${pct(pr)}</div></div>

    <div class="summary-item"><div class="label">加资源可提前</div><div class="value" style="color:var(--primary)">${projCanAdv}</div></div>

    <div class="summary-item"><div class="label">达到回款条件</div><div class="value" style="color:#F59E0B">${projReachedCond}</div></div>

    <div class="summary-item"><div class="label">延期</div><div class="value" style="color:var(--red)">${projDelayed}</div></div>

    `;

    summaryEl.style.display='';

  }else{

    summaryEl.innerHTML='';summaryEl.style.display='none';

  }

  const c=document.getElementById('tierTabContent');

  if(curTab==='projects'){
    // V5.9: 项目总览数据来源改为 项目验收日期、回款条件信息收集 Sheet
    var overviewProjects = (D.projectOverview && D.projectOverview.projects) ? D.projectOverview.projects : [];
    if(_naguanOn && D.naguanExclude){ overviewProjects = overviewProjects.filter(function(p){ return !D.naguanExclude[p.projectId]; }); }
    // 下钻模式下显示全量项目（不受区间限制）
    var displayProjects = window._overviewDrilldown ? overviewProjects : overviewProjects.filter(function(p){ return p.amountTier === curTier; });
    // 计算回款节点统计（与回款节点页面逻辑一致）
    var ovPids = new Set(); displayProjects.forEach(function(p){ ovPids.add(p.projectId); });
    var ovNodes = nodes.filter(function(n){ return n.isPaymentRelated && ovPids.has(n.projectId); });
    var ovExpected = ovNodes.reduce(function(s,n){ return s+(n.expectedPayment||0); },0);
    var ovActual = ovNodes.reduce(function(s,n){ return s+(n.actualPayment||0); },0);
    var ovRemaining = ovExpected - ovActual;
    var ovRate = ovExpected>0?ovActual/ovExpected:0;
    var ovAdv = ovNodes.filter(function(n){ return n.nodeStatus==='加资源可提前'; }).length;
    var ovReached = ovNodes.filter(function(n){ return n.nodeStatus==='达到回款条件'; }).length;
    var ovDelayed = ovNodes.filter(function(n){ return n.nodeStatus==='延期'; }).length;
    var ovNodeCount = ovNodes.length;
    summaryEl.innerHTML = '<div class=\"summary-item\"><div class=\"label\">项目总数</div><div class=\"value\" style=\"color:var(--dark)\">'+displayProjects.length+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">已回款总金额(万)</div><div class=\"value\" style=\"color:var(--green)\">'+fmtWan(ovActual)+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">待回款总金额(万)</div><div class=\"value\" style=\"color:var(--red)\">'+fmtWan(ovRemaining)+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">完成率</div><div class=\"value\" style=\"color:'+(ovRate>=0.8?'var(--green)':ovRate>=0.5?'var(--orange)':'var(--red)')+'\">'+pct(ovRate)+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">加资源可提前</div><div class=\"value\" style=\"color:var(--primary)\">'+ovAdv+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">达到回款条件</div><div class=\"value\" style=\"color:#F59E0B\">'+ovReached+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">延期</div><div class=\"value\" style=\"color:var(--red)\">'+ovDelayed+'</div></div>';
    summaryEl.style.display='';
    renderProjectOverviewTable(c, displayProjects);
  }

  else if(curTab==='nodes')renderNodes(c,nodes);

  else if(curTab==='plan')renderPlan(c,projs,s);

  else if(curTab==='risk')renderRisk(c,projs,nodes);

  else if(curTab==='integrity')renderIntegrity(c);

  if(_drillFilter.status){

    setTimeout(()=>{const el=document.getElementById('drillTarget');if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},100);

  }

}



function renderIntegrity(c){

  const inc=(D.summary[curTier]||{}).incompleteData||[];

  // Compute dashboard: total count and by-department counts

  const deptCounts={};

  inc.forEach(p=>{const d=p.orgL4||'未指定';deptCounts[d]=(deptCounts[d]||0)+1});

  const deptEntries=Object.entries(deptCounts).sort((a,b)=>b[1]-a[1]);

  const missingCompletion=inc.filter(p=>!p.projectCompletion).length;

  const missingMilestone=inc.filter(p=>!p.isMilestoneAchieved).length;

  // Build category options from orgL4

  

  c.innerHTML=`<div class="card"><div class="card-header" style="color:var(--orange)">数据完整性检查 <span style="font-weight:400;font-size:12px;color:var(--gray)">(${curTier})</span></div><div class="card-body">

    <div style="margin-bottom:14px;padding:12px 16px;background:var(--orange-50);border-radius:var(--radius-sm);font-size:13px;color:#B45309">

      筛选条件：关联回款=是 且 当前项目完成%为空 且 是否已达成里程碑为空

    </div>

    <div id="integritySummaryBar" class="summary-bar" style="margin-bottom:14px">

      <div class="summary-item"><div class="label">缺失项目总数</div><div class="value" style="color:var(--orange)">${inc.length}</div></div>

      <div class="summary-item"><div class="label">L4部门数</div><div class="value" style="color:var(--dark)">${deptEntries.length}</div></div>

      <div class="summary-item"><div class="label">项目完成%缺失</div><div class="value" style="color:${missingCompletion>0?'var(--red)':'var(--green)'}">${missingCompletion}</div></div>

      <div class="summary-item"><div class="label">里程碑达成缺失</div><div class="value" style="color:${missingMilestone>0?'var(--red)':'var(--green)'}">${missingMilestone}</div></div>

    </div>

    ${deptEntries.length>0?`<div style="margin-bottom:14px"><div style="font-size:12px;color:var(--gray);font-weight:600;margin-bottom:8px">各L4部门缺失项目数</div><div id="integrityDeptBadges" style="display:flex;flex-wrap:wrap;gap:6px">${deptEntries.map(([dept,cnt])=>`<span style="background:var(--orange-50);color:#B45309;padding:4px 10px;border-radius:99px;font-size:12px;font-weight:600">${dept} <b>${cnt}</b></span>`).join('')}</div></div>`:''}

    <div class="toolbar">

      <button class="btn btn-outline" onclick="exportIntegrityExcel()">导出Excel</button><button class="btn btn-outline" style="margin-left:auto;color:var(--primary);border-color:var(--primary);font-weight:600" onclick="showMissingCheckModal(curTier)" title="自定义检查当前区间指定字段的内容是否为空">数据缺失检查</button>

    </div>

    <div id="integrityTableClearBtn" style="margin-bottom:8px"></div><div class="table-wrap" style="max-height:500px"><table class="data-table" id="integrityTable"><thead><tr><th>项目编号${CF.renderIcon('integrityTable','projectId')}</th><th>项目名称${CF.renderIcon('integrityTable','projectName')}</th><th>项目经理L4部门${CF.renderIcon('integrityTable','orgL4')}</th><th>项目经理${CF.renderIcon('integrityTable','projectManager')}</th><th>当前项目完成%${CF.renderIcon('integrityTable','projectCompletion')}</th><th>是否已达成里程碑${CF.renderIcon('integrityTable','isMilestoneAchieved')}</th></tr></thead><tbody id="integrityBody">

    </tbody></table></div>

    <div class="table-record-count" id="integrityCount"></div>

  </div></div>`;

  filterIntegrity();

  // 数据缺失检查按钮
  var imcEl=document.getElementById('integrityMissingCheck');
  if(!imcEl){
    var imcDiv=document.createElement('div');
    imcDiv.id='integrityMissingCheck';
    imcDiv.style.cssText='margin-top:16px;padding-top:16px;border-top:1px solid var(--border-light)';
    var imcCard=c.querySelector('.card-body');
    if(imcCard)imcCard.appendChild(imcDiv);
  }
  // Missing check button is now inline with 导出Excel button

}

function filterIntegrity(){

  const inc=(D.summary[curTier]||{}).incompleteData||[];

  

  let filtered=CF.filterData('integrityTable',inc);
  const integrityClearBtn=document.getElementById('integrityTableClearBtn');if(integrityClearBtn)integrityClearBtn.innerHTML=CF.renderClearBtn('integrityTable');
  // Update integrity dashboard with filtered data
  var iDeptCounts={};filtered.forEach(function(p){var d=p.orgL4||'未指定';iDeptCounts[d]=(iDeptCounts[d]||0)+1});
  var iDeptEntries=Object.entries(iDeptCounts).sort(function(a,b){return b[1]-a[1]});
  var iMissingCompletion=filtered.filter(function(p){return !p.projectCompletion}).length;
  var iMissingMilestone=filtered.filter(function(p){return !p.isMilestoneAchieved}).length;
  var iSummaryEl=document.getElementById('integritySummaryBar');
  if(iSummaryEl)iSummaryEl.innerHTML='<div class="summary-item"><div class="label">缺失项目总数</div><div class="value" style="color:var(--orange)">'+filtered.length+'</div></div><div class="summary-item"><div class="label">L4部门数</div><div class="value" style="color:var(--dark)">'+iDeptEntries.length+'</div></div><div class="summary-item"><div class="label">项目完成%缺失</div><div class="value" style="color:'+(iMissingCompletion>0?'var(--red)':'var(--green)')+'">'+iMissingCompletion+'</div></div><div class="summary-item"><div class="label">里程碑达成缺失</div><div class="value" style="color:'+(iMissingMilestone>0?'var(--red)':'var(--green)')+'">'+iMissingMilestone+'</div></div>';
  var iDeptEl=document.getElementById('integrityDeptBadges');
  if(iDeptEl&&iDeptEntries.length>0)iDeptEl.innerHTML=iDeptEntries.map(function(e){return '<span style="background:var(--orange-50);color:#B45309;padding:4px 10px;border-radius:99px;font-size:12px;font-weight:600">'+e[0]+' <b>'+e[1]+'</b></span>'}).join('');

  

  const tb=document.getElementById('integrityBody');

  const cnt=document.getElementById('integrityCount');

  if(!tb)return;

  if(filtered.length===0){

    tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--green);padding:20px">数据完整，无待补全项</td></tr>';

  }else{

    tb.innerHTML=filtered.map(p=>{

      const pcMissing=!p.projectCompletion;

      const maMissing=!p.isMilestoneAchieved;

      return `<tr><td class="td-project-id">${p.projectId}</td><td class="td-project-name" title="${p.projectName||''}">${truncName(p.projectName||'')}</td><td>${p.orgL4||'-'}</td><td>${p.projectManager||'-'}</td><td>${pcMissing?'<span style="color:var(--red);font-weight:700">缺失</span>':(p.projectCompletion||'-')}</td><td>${maMissing?'<span style="color:var(--red);font-weight:700">缺失</span>':(p.isMilestoneAchieved||'-')}</td></tr>`;

    }).join('');

  }

  if(cnt)cnt.textContent=`共 ${filtered.length} 条记录`;

}
CF.register('integrityTable',filterIntegrity,function(){return (D.summary[curTier]||{}).incompleteData||[]});




// === Column Visibility with localStorage persistence ===

function getVisibleCols(tier,page){

  const saved=localStorage.getItem('colVis_'+tier+'_'+page);

  if(saved)try{return JSON.parse(saved)}catch{}

  const allCols=(D.displayColumns||{})[tier]||[];

  return allCols.map(c=>({key:c.key,label:c.label,visible:c.visible!==false}));

}

function saveVisibleCols(tier,page,cols){

  localStorage.setItem('colVis_'+tier+'_'+page,JSON.stringify(cols));

}

function excelDate(v){const n=typeof v==='number'?v:(typeof v==='string'&&/^\d{4,5}$/.test(v)?Number(v):null);if(n!==null&&n>40000&&n<60000){const d=new Date(Math.round((n-25569)*86400000));if(!isNaN(d.getTime()))return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}return null}

function isDateKey(k){return /(?:Date|日期|时间)(?:$|_)/.test(k)||/^(?:plan|actual|stage|expected|next|close)/.test(k)&&/Date$/.test(k)}

/* Column width classification (5-tier: narrow / label-medium / standard / wide / xwide / text2) */
/* Narrow: very short content like tier badge, planMonth number */
const _narrowKeys=new Set(['tier','nodeStatus','paymentStatus','planMonth','delayDays']);
/* Label-medium: boolean/是否 fields and date fields with longer header labels that need full display for filter icons */
const _labelMediumKeys=new Set(['isPaymentRelated','isMilestoneAchieved','expectedMilestoneDate','serviceType','deliveryCenter','contractAmount','projectManager','orgL4','paymentRatio','actualPaymentRatio','planPaymentRatio']);
const _wideKeys=new Set(['projectName','orgL5','canAdvance']);
const _text2Keys=new Set(['advanceDetail','blocker','nextAction','remarks','remarks2']);
const _xwideKeys=new Set(['requirement','advanceReason']);
/* Backward compat: _longKeys = _xwideKeys */
const _longKeys=_xwideKeys;

/** Truncate text >26 chars with .... */
function _truncText2(s){if(!s)return s;return s.length>26?s.slice(0,26)+'....':s}

/** Get column width tier class for a given key */
/** Build <colgroup> HTML from column definitions */
function _colGroupHtml(cols){
  return '<colgroup>'+cols.map(c=>'<col class="'+_colClass(c.key)+'">').join('')+'</colgroup>';
}

function _colClass(key){
  if(key==='projectId'||key==='项目编号')return 'td-project-id';
  if(key==='projectName'||(key&&key.indexOf('项目名称')>=0))return 'td-project-name';
  if(_narrowKeys.has(key))return 'td-narrow';
  if(_labelMediumKeys.has(key))return 'td-label-medium';
  if(_text2Keys.has(key))return 'td-text2';
  if(_wideKeys.has(key))return 'td-wide';
  if(_xwideKeys.has(key))return 'td-xwide';
  // Chinese key heuristics for overview table
  if(key){
    if(key.indexOf('名称')>=0&&key.indexOf('项目')>=0)return 'td-project-name';
    if(key.indexOf('编号')>=0)return 'td-project-id';
    if(key.indexOf('备注')>=0||key.indexOf('截图')>=0||key.indexOf('图片')>=0)return 'td-project-name';
    if(key.indexOf('客户')>=0||key.indexOf('单位')>=0||key.indexOf('部门')>=0||key.indexOf('经理')>=0)return 'td-medium';
  }
  return 'td-medium';
}

function fmtCell(n,key){

  if(n==null||n===undefined)return '<td class="'+_colClass(key)+'">-</td>';

  const v=n[key];

  if(v==null||v===undefined||v==='')return '<td class="'+_colClass(key)+'">-</td>';

  const cls=_colClass(key);

  if(isDateKey(key)){const ed=excelDate(v);if(ed)return `<td class="${cls}" style="font-family:var(--font-mono)">${ed}</td>`;if(typeof v==='string'&&/^\d{4}-\d{2}/.test(v))return `<td class="${cls}" style="font-family:var(--font-mono)">${v.slice(0,10)}</td>`}

  if(typeof v==='string'&&/^\d{4,5}$/.test(v)){const ed=excelDate(v);if(ed)return `<td class="${cls}" style="font-family:var(--font-mono)">${ed}</td>`}

  if(key==='projectAmount'||key==='expectedPayment'||key==='actualPayment')return `<td class="${cls}" style="text-align:right;font-family:var(--font-mono)">${fmtYuan(v)}</td>`;

  if(key==='planPaymentRatio'||key==='paymentRatio'||key==='actualPaymentRatio'){
    /* 比例列：云文档原表显示为百分数（如80%），Excel底层存储为0-1小数（如0.8）
       前端需统一转为百分数显示，与云文档原表格式保持一致
       边界条件：□ null/undefined □ '空值'/'' □ 0 → "0%" □ ≥1(如1.08) → "108%" □ 非数字原样返回 */
    /* 空值/'空值'由函数开头统一处理为'-'，此处处理有效数值 */
    const formatted=pct(v);
    return `<td class="${cls}" style="text-align:right;font-family:var(--font-mono)">${formatted}</td>`;
  }

  if(key==='projectCompletion'){
    /* projectCompletion列同样是比例值（0-1小数），与比例列统一转为百分数显示
       边界条件：□ null/undefined □ '空值'/'' □ 0 → "0%" □ ≥1(如1) → "100%" □ 非数字原样返回 */
    const formatted=pct(v);
    return `<td class="${cls}" style="text-align:right;font-family:var(--font-mono)">${formatted}</td>`;
  }

  // xxxNum fields removed from data source, no longer needed here

  if(key==='isPaymentRelated'||key==='isMilestoneAchieved')return `<td class="td-narrow">${v===true||v==='true'||v==='是'?'是':'否'}</td>`;
  if(key==='canAdvance')return `<td class="td-wide">${v===true||v==='true'||v==='是'?'是':'否'}</td>`;
  if(key==='纳管'){if(v==='否')return '<td class=\"td-narrow\" style=\"color:#EF4444\">否</td>';if(v==='是'||v===true||v==='true')return '<td class=\"td-narrow\" style=\"color:#10B981\">是</td>';return '<td class=\"td-narrow\">-</td>';}

  if(key==='nodeStatus'){const bc=v==='延期'?'badge-red':v==='加资源可提前'?'badge-purple':v==='已提前回款'?'badge-green':v==='已全额回款'?'badge-emerald':v==='正常实施中'?'badge-blue':v==='达到回款条件'?'badge-amber':'badge-gray';const label=v;return `<td class="td-narrow"><span class="badge ${bc}">${label}</span></td>`}

  if(key==='paymentStatus'){const bc=v==='延期'?'badge-red':v==='加资源可提前'?'badge-purple':v==='已提前回款'?'badge-green':v==='已全额回款'?'badge-emerald':v==='正常实施中'?'badge-blue':v==='达到回款条件'?'badge-amber':'badge-gray';return `<td class="td-narrow"><span class="badge ${bc}">${v}</span></td>`}


  if(key==='delayDays')return `<td class="td-narrow" style="color:${v>0?'var(--red)':'var(--green)'};font-weight:700;font-family:var(--font-mono)">${v}天</td>`;

  if(key==='tier')return `<td class="td-narrow"><span class="badge ${v==='100万以上'?'badge-red':v==='50-100万'?'badge-orange':'badge-green'}">${v}</span></td>`;

  const s=String(v).replace(/\r\n/g,' ').replace(/\n/g,' ').replace(/\r/g,' ');

  if(key==='projectId')return `<td class="td-project-id" data-cell-tooltip="${escAttr(s)}">${s}</td>`;

if(key==='projectName')return `<td class="td-project-name" data-cell-tooltip="${escAttr(s)}">${truncName(s)}</td>`;

  if(_text2Keys.has(key))return `<td class="td-text2" data-cell-tooltip="${escAttr(s)}">${_truncText2(s)}</td>`;

  if(_xwideKeys.has(key))return `<td class="td-xwide" data-cell-tooltip="${escAttr(s)}">${s}</td>`;

  if(_wideKeys.has(key))return `<td class="td-wide" data-cell-tooltip="${escAttr(s)}">${s}</td>`;

  return `<td class="${cls}" data-cell-tooltip="${escAttr(s)}">${s}</td>`;

}



function renderProjects(c,projs){

  

  const cols=getVisibleCols(curTier,'projects');

  c.innerHTML=`<div id="projTableClearBtn" style="margin-bottom:8px">${CF.renderClearBtn('projTable')}</div><div class="toolbar">

    <input type="text" id="pSearch" placeholder="搜索项目编号/名称/经理..." oninput="filterProj()">

    

    <span style="position:relative;display:inline-block"><button class="btn btn-outline" onclick="toggleColVis('pcv')">设置展示字段</button><div class="col-vis-popup" id="pcv"></div></span>
        <button class="btn btn-outline" style="margin-left:auto" onclick="exportProjExcel()">导出Excel</button>

  </div><div class="table-wrap" style="max-height:calc(100vh - 260px)"><table class="data-table" id="tierProjectTable"><thead></thead><tbody></tbody></table></div><div class="table-record-count" id="tierProjectCount"></div>`;

  const cv=document.getElementById('pcv');

  if(cv)cv.innerHTML=`<div style="display:flex;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-light)"><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="{const c=getVisibleCols(curTier,'projects');c.forEach(x=>{x.visible=true});saveVisibleCols(curTier,'projects',c);filterProj()}">全选</button><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="{const c=getVisibleCols(curTier,'projects');c.forEach(x=>{x.visible=false});saveVisibleCols(curTier,'projects',c);filterProj()}">取消全选</button></div>`+cols.map((c,i)=>`<label><input type="checkbox" ${c.visible?'checked':''} onchange="toggleProjCol(${i})"> ${c.label}</label>`).join('');

  filterProj();

}

function toggleProjCol(idx){

  const cols=getVisibleCols(curTier,'projects');

  cols[idx].visible=!cols[idx].visible;

  saveVisibleCols(curTier,'projects',cols);

  filterProj();

}


function updateTierSummary(filteredNodes){
  if(curTab!=='projects')return;
  const projs=groupByProject(filteredNodes);
  const totalActual=projs.reduce((s,p)=>s+(p.actualPayment||0),0);
  const totalExpected=projs.reduce((s,p)=>s+(p.expectedPayment||0),0);
  const pr=totalExpected>0?totalActual/totalExpected:0;
  const projCanAdv=projs.filter(p=>p.paymentStatus==='加资源可提前').length;
  const projReachedCond=projs.filter(p=>p.paymentStatus==='达到回款条件').length;
  const projDelayed=projs.filter(p=>p.paymentStatus==='延期').length;
    const totalActW=totalActual;
  const totalRemW=(totalExpected-totalActual);
  const summaryEl=document.getElementById('tierSummary');
  if(!summaryEl)return;
  summaryEl.innerHTML=`
  <div class="summary-item"><div class="label">项目总数</div><div class="value" style="color:var(--dark)">${projs.length}</div></div>
  <div class="summary-item"><div class="label">已回款总金额(万)</div><div class="value" style="color:var(--green)">${fmtWan(totalActW)}</div></div>
  <div class="summary-item"><div class="label">待回款总金额(万)</div><div class="value" style="color:var(--red)">${fmtWan(totalRemW)}</div></div>
  <div class="summary-item"><div class="label">完成率</div><div class="value" style="color:${pr>=0.8?'var(--green)':pr>=0.5?'var(--orange)':'var(--red)'}">${pct(pr)}</div></div>
  <div class="summary-item"><div class="label">加资源可提前</div><div class="value" style="color:var(--primary)">${projCanAdv}</div></div>
  <div class="summary-item"><div class="label">达到回款条件</div><div class="value" style="color:#F59E0B">${projReachedCond}</div></div>
  <div class="summary-item"><div class="label">延期</div><div class="value" style="color:var(--red)">${projDelayed}</div></div>
  `;
}
function filterProj(){

  const q=(document.getElementById('pSearch')?.value||'').toLowerCase();

  const cols=getVisibleCols(curTier,'projects');

  const visCols=cols.filter(c=>c.visible);

  // 使用getFilteredNodes()确保视角过滤（L4/PM）在列筛选等场景下生效
  let ns=getFilteredNodes().filter(n=>n.tier===curTier);

  

  

  if(q)ns=ns.filter(function(n){var h='';for(var k in n){if(n.hasOwnProperty(k)&&typeof n[k]!=='function')h+=(n[k]||'')+' ';}return h.toLowerCase().indexOf(q)>=0;});

  ns=CF.filterData('projTable',ns);
  updateTierSummary(ns);
  const projClearBtn=document.getElementById('projTableClearBtn');if(projClearBtn)projClearBtn.innerHTML=CF.renderClearBtn('projTable');

  const tableEl=document.querySelector('#tierProjectTable');
  let cg=tableEl.querySelector('colgroup');
  if(!cg){cg=document.createElement('colgroup');tableEl.insertBefore(cg,tableEl.firstChild)}
  cg.innerHTML=visCols.map(c=>'<col class="'+_colClass(c.key)+'">').join('');

  const th=document.querySelector('#tierProjectTable thead');

  const tb=document.querySelector('#tierProjectTable tbody');

  th.innerHTML='<tr>'+visCols.map(c=>'<th class="'+_colClass(c.key)+'">'+c.label+CF.renderIcon('projTable',c.key)+'</th>').join('')+'</tr>';

  const gm={};let gi=0;ns.forEach(n=>{if(!(n.projectId in gm)){gm[n.projectId]=gi;gi++}});

  tb.innerHTML=ns.slice(0,500).map(n=>{

    const gc=gm[n.projectId]%2===0?'proj-group-a':'proj-group-b';

    return `<tr class="${gc}">`+visCols.map(c=>fmtCell(n,c.key)).join('')+'</tr>';

  }).join('');

  const cnt=document.getElementById('tierProjectCount');if(cnt)cnt.textContent=`共 ${ns.length} 条记录`;

  const cv=document.getElementById('pcv');

  if(cv)cv.innerHTML=`<div style="display:flex;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-light)"><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="{const c=getVisibleCols(curTier,'projects');c.forEach(x=>{x.visible=true});saveVisibleCols(curTier,'projects',c);filterProj()}">全选</button><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="{const c=getVisibleCols(curTier,'projects');c.forEach(x=>{x.visible=false});saveVisibleCols(curTier,'projects',c);filterProj()}">取消全选</button></div>`+cols.map((c,i)=>`<label><input type="checkbox" ${c.visible?'checked':''} onchange="toggleProjCol(${i})"> ${c.label}</label>`).join('');

}



// Calendar Range Picker

let _cal={year:new Date().getFullYear(),month:new Date().getMonth(),pickStart:null,pickEnd:null,pickPhase:0,mode:'none',displayText:''};

function _calPad(n){return String(n).padStart(2,'0')}

function _calLastDay(y,m){return new Date(y,m+1,0).getDate()}

function _calDateStr(y,m,d){return `${y}-${_calPad(m+1)}-${_calPad(d)}`}



function _renderCalMonth(year,month){

  const today=new Date();const ty=today.getFullYear(),tm=today.getMonth(),td=today.getDate();

  const dow=new Date(year,month,1).getDay();const startOff=dow===0?6:dow-1;

  const dim=_calLastDay(year,month);const prevDim=_calLastDay(year,month-1);

  const h=[];

  h.push(`<div class="cal-panel">`);

  h.push(`<div class="cal-month-label">${year}年${month+1}月</div>`);

  h.push(`<div class="cal-weekdays">${['一','二','三','四','五','六','日'].map(d=>`<span>${d}</span>`).join('')}</div>`);

  h.push(`<div class="cal-days">`);

  for(let i=0;i<startOff;i++)h.push(`<span class="cal-day other-month">${prevDim-startOff+i+1}</span>`);

  for(let d=1;d<=dim;d++){

    const ds=_calDateStr(year,month,d);

    let cls='cal-day';

    if(year===ty&&month===tm&&d===td)cls+=' today';

    const s=_cal.pickStart,e=_cal.pickEnd;

    if(s&&e&&ds>=s&&ds<=e){

      if(ds===s&&ds===e)cls+=' selected';

      else if(ds===s)cls+=' range-start';

      else if(ds===e)cls+=' range-end';

      else cls+=' in-range';

    }else if(ds===s)cls+=' selected';

    h.push(`<span class="${cls}" onclick="calClickDay('${ds}')">${d}</span>`);

  }

  const total=startOff+dim;const rem=total%7===0?0:7-total%7;

  for(let i=1;i<=rem;i++)h.push(`<span class="cal-day other-month">${i}</span>`);

  h.push(`</div></div>`);

  return h.join('');

}



function calRender(){

  const popup=document.getElementById('calPopup');if(!popup)return;

  const m2=(_cal.month+1)%12,y2=_cal.month+1>11?_cal.year+1:_cal.year;

  let info='请选择：点日期=区间，点月份=整月，点年份=整年';

  if(_cal.mode==='year')info=`已选整年：${_cal.displayText}`;

  else if(_cal.mode==='month')info=`已选整月：${_cal.displayText}`;

  else if(_cal.mode==='range'&&_cal.pickStart&&_cal.pickEnd)info=`已选区间：${_cal.displayText}`;

  else if(_cal.pickPhase===1&&_cal.pickStart)info=`已选起点 ${_cal.pickStart}，请点终点`;

  popup.innerHTML=`<div class="cal-mode-bar">${info}</div>

    <div class="cal-nav-bar">

      <div class="cal-nav-group">

        <button class="cal-nav-btn" onclick="calYearPrev()" style="font-weight:900;font-size:18px">&lt;</button>

        <span class="cal-nav-text" onclick="calClickYear(${_cal.year})">${_cal.year}年</span>

        <button class="cal-nav-btn" onclick="calYearNext()" style="font-weight:900;font-size:18px">&gt;</button>

      </div>

      <div class="cal-nav-group">

        <button class="cal-nav-btn" onclick="calMonthPrev()" style="font-weight:900;font-size:18px">&lt;</button>

        <span class="cal-nav-text" onclick="calClickMonth(${_cal.year},${_cal.month})">${_cal.month+1}月</span>

        <button class="cal-nav-btn" onclick="calMonthNext()" style="font-weight:900;font-size:18px">&gt;</button>

      </div>

    </div>

    <div class="cal-panels">${_renderCalMonth(_cal.year,_cal.month)}${_renderCalMonth(y2,m2)}</div><div class="cal-actions"><button class="btn btn-outline" onclick="calClear()">清除</button><button class="btn btn-outline" onclick="calClose()">关闭</button><button class="btn btn-primary" onclick="calQuery()">查询</button></div>`;

}



function calYearPrev(){_cal.year--;calRender()}

function calYearNext(){_cal.year++;calRender()}

function calMonthPrev(){_cal.month--;if(_cal.month<0){_cal.month=11;_cal.year--}calRender()}

function calMonthNext(){_cal.month++;if(_cal.month>11){_cal.month=0;_cal.year++}calRender()}



function calClickDay(ds){

  if(_cal.pickPhase===0){

    _cal.pickStart=ds;_cal.pickEnd=null;_cal.pickPhase=1;_cal.mode='none';_cal.displayText='';

  }else{

    if(ds<_cal.pickStart){_cal.pickEnd=_cal.pickStart;_cal.pickStart=ds}

    else{_cal.pickEnd=ds}

    _cal.pickPhase=0;

    _cal.mode='range';

    _cal.displayText=_cal.pickStart+'~'+_cal.pickEnd;

  }

  calRender();

}



function calClickMonth(year,month){

  _cal.pickStart=_calDateStr(year,month,1);

  _cal.pickEnd=_calDateStr(year,month,_calLastDay(year,month));

  _cal.pickPhase=0;_cal.mode='month';

  _cal.displayText=`${year}-${_calPad(month+1)}`;

  calRender();

}



function calClickYear(year){

  _cal.pickStart=year+'-01-01';_cal.pickEnd=year+'-12-31';

  _cal.pickPhase=0;_cal.mode='year';

  _cal.displayText=String(year);

  calRender();

}



function calClear(){

  _cal.pickStart=null;_cal.pickEnd=null;_cal.pickPhase=0;_cal.mode='none';_cal.displayText='';

  const btn=document.getElementById('calBtn');

  if(btn){btn.textContent='选择日期';btn.classList.remove('active')}

  calRender();filterNodes();

}



function calQuery(){

  const btn=document.getElementById('calBtn');

  if(!_cal.pickStart||!_cal.pickEnd){

    _cal.mode='none';_cal.displayText='';

    if(btn){btn.textContent='选择日期';btn.classList.remove('active')}

    document.getElementById('calPopup')?.classList.remove('show');

    filterNodes();return;

  }

  const s=_cal.pickStart,e=_cal.pickEnd;

  if(_cal.mode==='year'||(s.endsWith('-01-01')&&e.endsWith('-12-31')&&s.substring(0,4)===e.substring(0,4))){

    _cal.mode='year';_cal.displayText=s.substring(0,4);

  }else if(_cal.mode==='month'||(s.endsWith('-01')&&e===_calDateStr(parseInt(s.substring(0,4)),parseInt(s.substring(5,7))-1,_calLastDay(parseInt(s.substring(0,4)),parseInt(s.substring(5,7))-1))&&s.substring(0,7)===e.substring(0,7))){

    _cal.mode='month';_cal.displayText=s.substring(0,7);

  }else{

    _cal.mode='range';_cal.displayText=s+'~'+e;

  }

  if(btn){btn.textContent=_cal.displayText;btn.classList.add('active')}

  document.getElementById('calPopup')?.classList.remove('show');

  filterNodes();

}



function toggleCal(){const p=document.getElementById('calPopup');if(p){p.classList.toggle('show');if(p.classList.contains('show'))calRender()}}



function renderNodes(c,nodes){

  const related=nodes.filter(n=>n.isPaymentRelated);

  const onTime=related.filter(n=>n.nodeStatus==='正常实施中');

  const advance=related.filter(n=>n.nodeStatus==='已提前回款');

  const delayed=related.filter(n=>n.nodeStatus==='延期');

  
  const paid100=related.filter(n=>pctToNum(n.actualPaymentRatio)!==null&&pctToNum(n.actualPaymentRatio)>=1);

  const totalExpected=related.reduce((s,n)=>s+(n.expectedPayment||0),0);

  const totalActual=related.reduce((s,n)=>s+(n.actualPayment||0),0);

  const totalRemaining=totalExpected-totalActual;

  const completionRate=totalExpected>0?totalActual/totalExpected:0;

  const remW=totalRemaining;

  const actW=totalActual;

  const cols=getVisibleCols(curTier,'nodes');

  c.innerHTML=((window._fuNodeDrillProject)?'<div style=\"display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:8px;margin-bottom:12px\"><span style=\"font-size:13px\">下钻筛选: <b style=\"color:#4338CA\">项目编号 '+window._fuNodeDrillProject+'</b></span><button onclick=\"window._fuClearNodeDrill()\" style=\"font-size:11px;padding:4px 12px;cursor:pointer;background:#4338CA;color:#fff;border:none;border-radius:4px\">✕ 关闭下钻</button></div>':'')+`<div id="nodeTableClearBtn" style="margin-bottom:8px">${CF.renderClearBtn('nodeTable')}</div><div class="toolbar">

    <input type="text" id="nSearch" placeholder="搜索项目编号/名称..." oninput="filterNodes()" style="width:200px">

    <div class="cal-picker">

      <button class="cal-btn" id="calBtn" onclick="toggleCal()">选择日期</button>

      <div class="cal-popup" id="calPopup"></div>

    </div>

    <select id="nStatus" onchange="filterNodes()"><option value="">全部状态</option><option value="正常实施中">正常实施中</option><option value="已提前回款">已提前回款</option><option value="延期">延期</option><option value="加资源可提前">加资源可提前</option><option value="已全额回款">已全额回款</option><option value="达到回款条件">达到回款条件</option></select>

    <span style="position:relative;display:inline-block"><button class="btn btn-outline" onclick="toggleColVis('ncv')">设置展示字段</button><div class="col-vis-popup" id="ncv"></div></span>
        <button class="btn btn-outline" style="margin-left:auto" onclick="exportNodeExcel()">导出Excel</button>

  </div><div class="table-wrap" style="max-height:calc(100vh - 260px)"><table class="data-table" id="tierNodeTable"><thead></thead><tbody></tbody></table></div><div class="table-record-count" id="tierNodeCount"></div>`;

  const cv=document.getElementById('ncv');

  if(cv)cv.innerHTML=`<div style="display:flex;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-light)"><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="{const c=getVisibleCols(curTier,'nodes');c.forEach(x=>{x.visible=true});saveVisibleCols(curTier,'nodes',c);filterNodes()}">全选</button><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="{const c=getVisibleCols(curTier,'nodes');c.forEach(x=>{x.visible=false});saveVisibleCols(curTier,'nodes',c);filterNodes()}">取消全选</button></div>`+cols.map((c,i)=>`<label><input type="checkbox" ${c.visible?'checked':''} onchange="toggleNodeCol(${i})"> ${c.label}</label>`).join('');

  filterNodes();

}

function toggleNodeCol(idx){

  const cols=getVisibleCols(curTier,'nodes');

  cols[idx].visible=!cols[idx].visible;

  saveVisibleCols(curTier,'nodes',cols);

  filterNodes();

}

CF.register('projTable',filterProj,function(){return getFilteredNodes().filter(function(n){return n.tier===curTier})});


function updateNodeSummary(filteredNodes){
  if(curTab!=='nodes')return;
  const related=filteredNodes.filter(n=>n.isPaymentRelated);
  const canAdv=related.filter(n=>n.nodeStatus==='加资源可提前').length;
  const reachedCond=related.filter(n=>n.nodeStatus==='达到回款条件').length;
  const delayed=related.filter(n=>n.nodeStatus==='延期').length;
  const totalExpected=related.reduce((s,n)=>s+(n.expectedPayment||0),0);
  const totalActual=related.reduce((s,n)=>s+(n.actualPayment||0),0);
  const totalRemaining=totalExpected-totalActual;
  const completionRate=totalExpected>0?totalActual/totalExpected:0;
  const remW=totalRemaining;
  const actW=totalActual;
  const summaryEl=document.getElementById('tierSummary');
  if(!summaryEl||curTab!=='nodes')return;
  const relatedPids=new Set(related.map(n=>n.projectId));
  const relatedProjectCount=relatedPids.size;
  summaryEl.innerHTML=`
  <div class="summary-item"><div class="label">回款节点数</div><div class="value" style="color:var(--dark)">${related.length}</div></div>
  <div class="summary-item"><div class="label">已回款总金额(万)</div><div class="value" style="color:var(--green)">${fmtWan(actW)}</div></div>
  <div class="summary-item"><div class="label">待回款总金额(万)</div><div class="value" style="color:var(--red)">${fmtWan(remW)}</div></div>
  <div class="summary-item"><div class="label">完成率</div><div class="value" style="color:${completionRate>=0.8?'var(--green)':completionRate>=0.5?'var(--orange)':'var(--red)'}">${pct(completionRate)}</div></div>
  <div class="summary-item"><div class="label">加资源可提前</div><div class="value" style="color:var(--primary)">${canAdv}</div></div>
  <div class="summary-item"><div class="label">达到回款条件</div><div class="value" style="color:#F59E0B">${reachedCond}</div></div>
  <div class="summary-item"><div class="label">延期</div><div class="value" style="color:var(--red)">${delayed}</div></div>
  `;
  summaryEl.style.display='';
}
function filterNodes(){

  const sf=document.getElementById('nStatus')?.value||'';

  const q=(document.getElementById('nSearch')?.value||'').toLowerCase();

  const cols=getVisibleCols(curTier,'nodes');

  const visCols=cols.filter(c=>c.visible);

  // 使用getFilteredNodes()确保视角过滤（L4/PM）在列筛选等场景下生效
  let ns=getFilteredNodes().filter(n=>n.tier===curTier&&n.isPaymentRelated);

  if(_cal.pickStart&&_cal.pickEnd){

    ns=ns.filter(n=>n.planDate&&n.planDate>=_cal.pickStart&&n.planDate<=_cal.pickEnd);

  }

  

  if(q)ns=ns.filter(function(n){var h='';for(var k in n){if(n.hasOwnProperty(k)&&typeof n[k]!=='function')h+=(n[k]||'')+' ';}return h.toLowerCase().indexOf(q)>=0;});

  ns=CF.filterData('nodeTable',ns);
  const nodeClearBtn=document.getElementById('nodeTableClearBtn');if(nodeClearBtn)nodeClearBtn.innerHTML=CF.renderClearBtn('nodeTable');
  updateNodeSummary(ns);

  const nodeTableEl=document.querySelector('#tierNodeTable');
  let ncg=nodeTableEl.querySelector('colgroup');
  if(!ncg){ncg=document.createElement('colgroup');nodeTableEl.insertBefore(ncg,nodeTableEl.firstChild)}
  ncg.innerHTML=visCols.map(c=>'<col class="'+_colClass(c.key)+'">').join('');

  const th=document.querySelector('#tierNodeTable thead');

  const tb=document.querySelector('#tierNodeTable tbody');

  th.innerHTML='<tr>'+visCols.map(c=>'<th class="'+_colClass(c.key)+'">'+c.label+CF.renderIcon('nodeTable',c.key)+'</th>').join('')+'</tr>';

  const gm={};let gi=0;ns.forEach(n=>{if(!(n.projectId in gm)){gm[n.projectId]=gi;gi++}});

  tb.innerHTML=ns.slice(0,500).map(n=>{

    const gc=gm[n.projectId]%2===0?'proj-group-a':'proj-group-b';

    return `<tr class="${gc}">`+visCols.map(c=>fmtCell(n,c.key)).join('')+'</tr>';

  }).join('');

  const cnt=document.getElementById('tierNodeCount');if(cnt)cnt.textContent=`共 ${ns.length} 条记录`;

  const cv=document.getElementById('ncv');

  if(cv)cv.innerHTML=`<div style="display:flex;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-light)"><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="{const c=getVisibleCols(curTier,'nodes');c.forEach(x=>{x.visible=true});saveVisibleCols(curTier,'nodes',c);filterNodes()}">全选</button><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="{const c=getVisibleCols(curTier,'nodes');c.forEach(x=>{x.visible=false});saveVisibleCols(curTier,'nodes',c);filterNodes()}">取消全选</button></div>`+cols.map((c,i)=>`<label><input type="checkbox" ${c.visible?'checked':''} onchange="toggleNodeCol(${i})"> ${c.label}</label>`).join('');

}
CF.register('nodeTable',filterNodes,function(){return getFilteredNodes().filter(function(n){return n.tier===curTier})});


function toggleColVis(id){document.getElementById(id)?.classList.toggle('show')}

function calClose(){document.getElementById('calPopup')?.classList.remove('show')}

document.addEventListener('click',e=>{if(!e.target.closest('.btn-outline')&&!e.target.closest('.col-vis-popup'))document.querySelectorAll('.col-vis-popup').forEach(p=>p.classList.remove('show'))});



function renderPlan(c,projs,s){

  const allNodes=tierNodes(curTier).filter(n=>n.isPaymentRelated);

  // Plan-specific dashboard

  const canAdvNodes=allNodes.filter(n=>n.nodeStatus==='加资源可提前');

  const reachedCondNodes=allNodes.filter(n=>n.nodeStatus==='达到回款条件');

  const advNodes=allNodes.filter(n=>n.nodeStatus==='已提前回款');

  const fullPaidNodes=allNodes.filter(n=>n.nodeStatus==='已全额回款');

  const onTimeNodes=allNodes.filter(n=>n.nodeStatus==='正常实施中');

  const delayedNodes=allNodes.filter(n=>n.nodeStatus==='延期');

  const paidNodes=allNodes.filter(n=>pctToNum(n.actualPaymentRatio)!==null&&pctToNum(n.actualPaymentRatio)>=1);

  const totalExp=allNodes.reduce((s,n)=>s+(n.expectedPayment||0),0);

  const totalAct=allNodes.reduce((s,n)=>s+(n.actualPayment||0),0);

  const totalRem=totalExp-totalAct;

  const rate=totalExp>0?totalAct/totalExp:0;

  const expW=totalExp;

  const actW=totalAct;

  const remW=totalRem;

  const cols=getVisibleCols(curTier,'plan');

  const visCols=cols.filter(c=>c.visible);

  const boards=[

    {label:'加资源可提前',filter:n=>n.nodeStatus==='加资源可提前',color:'var(--primary)'},

    {label:'达到回款条件',filter:n=>n.nodeStatus==='达到回款条件',color:'#F59E0B'},

    {label:'已提前回款',filter:n=>n.nodeStatus==='已提前回款',color:'#059669'},

    {label:'已全额回款',filter:n=>n.nodeStatus==='已全额回款',color:'#10B981'},

    {label:'延期',filter:n=>n.nodeStatus==='延期',color:'var(--red)'},

    {label:'正常实施中',filter:n=>n.nodeStatus==='正常实施中',color:'var(--blue)'}

  ];

  c.innerHTML=`<div id="planSummaryBar" class="summary-bar" style="margin-bottom:14px">

    <div class="summary-item"><div class="label">节点计划回款金额（万）</div><div class="value" style="color:var(--blue)">${fmtWan(expW)}</div></div>

    <div class="summary-item"><div class="label">节点已回款金额（万）</div><div class="value" style="color:var(--green)">${fmtWan(actW)}</div></div>

    <div class="summary-item"><div class="label">节点待回款金额（万）</div><div class="value" style="color:var(--red)">${fmtWan(remW)}</div></div>

    <div class="summary-item"><div class="label">完成率</div><div class="value" style="color:${rate>=0.8?'var(--green)':rate>=0.5?'var(--orange)':'var(--red)'}">${pct(rate)}</div></div>

  </div>
  <div class="plan-status-grid" id="planStatusGrid">

    <div class="plan-status-card" onclick="var el=document.getElementById('planBoard_0');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})" style="cursor:pointer" title="点击下钻到子看板"><div class="label">加资源可提前</div><div class="value" style="color:var(--primary)">${canAdvNodes.length}</div></div>

    <div class="plan-status-card" onclick="var el=document.getElementById('planBoard_1');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})" style="cursor:pointer" title="点击下钻到子看板"><div class="label">达到回款条件</div><div class="value" style="color:#F59E0B">${reachedCondNodes.length}</div></div>

    <div class="plan-status-card" onclick="var el=document.getElementById('planBoard_2');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})" style="cursor:pointer" title="点击下钻到子看板"><div class="label">已提前回款</div><div class="value" style="color:#059669">${advNodes.length}</div></div>

    <div class="plan-status-card" onclick="var el=document.getElementById('planBoard_3');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})" style="cursor:pointer" title="点击下钻到子看板"><div class="label">已全额回款</div><div class="value" style="color:#10B981">${fullPaidNodes.length}</div></div>

    <div class="plan-status-card" onclick="var el=document.getElementById('planBoard_4');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})" style="cursor:pointer" title="点击下钻到子看板"><div class="label">延期</div><div class="value" style="color:var(--red)">${delayedNodes.length}</div></div>

    <div class="plan-status-card" onclick="var el=document.getElementById('planBoard_5');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})" style="cursor:pointer" title="点击下钻到子看板"><div class="label">正常实施中</div><div class="value" style="color:var(--blue)">${onTimeNodes.length}</div></div>

  </div><div class="toolbar">

    <span style="position:relative;display:inline-block"><button class="btn btn-outline" onclick="toggleColVis('plcv')">设置展示字段</button><div class="col-vis-popup" id="plcv"></div></span>

    <button class="btn btn-outline cf-linkage-btn" id="cfLinkageBtn" onclick="CF.toggleLinkage()">筛选联动</button>

    <span id="planClearBtn"></span>
    <button class="btn btn-outline" style="margin-left:auto" onclick="exportPlanExcel()">导出Excel</button>

  </div>

  <div class="plan-boards" id="planBoards"></div>`;

  const cv=document.getElementById('plcv');

  if(cv)cv.innerHTML=cols.map((c,i)=>`<label><input type="checkbox" ${c.visible?'checked':''} onchange="togglePlanCol(${i})"> ${c.label}</label>`).join('');

  renderPlanBoards(allNodes,boards,visCols,cols);

}

function selectAllPlanCols(){const c=getVisibleCols(curTier,'plan');c.forEach(x=>{x.visible=true});saveVisibleCols(curTier,'plan',c);refreshPlanBoards()}

function deselectAllPlanCols(){const c=getVisibleCols(curTier,'plan');c.forEach(x=>{x.visible=false});saveVisibleCols(curTier,'plan',c);refreshPlanBoards()}
CF.register('planBoard_0',refreshPlanBoards,function(){return tierNodes(curTier).filter(n=>n.isPaymentRelated)});
CF.register('planBoard_1',refreshPlanBoards,function(){return tierNodes(curTier).filter(n=>n.isPaymentRelated)});
CF.register('planBoard_2',refreshPlanBoards,function(){return tierNodes(curTier).filter(n=>n.isPaymentRelated)});
CF.register('planBoard_3',refreshPlanBoards,function(){return tierNodes(curTier).filter(n=>n.isPaymentRelated)});
CF.register('planBoard_4',refreshPlanBoards,function(){return tierNodes(curTier).filter(n=>n.isPaymentRelated)});
CF.register('planBoard_5',refreshPlanBoards,function(){return tierNodes(curTier).filter(n=>n.isPaymentRelated)});
function refreshPlanBoards(){const an=tierNodes(curTier).filter(n=>n.isPaymentRelated);const bd=[{label:'加资源可提前',filter:n=>n.nodeStatus==='加资源可提前',color:'var(--primary)'},{label:'达到回款条件',filter:n=>n.nodeStatus==='达到回款条件',color:'#F59E0B'},{label:'已提前回款',filter:n=>n.nodeStatus==='已提前回款',color:'#059669'},{label:'已全额回款',filter:n=>n.nodeStatus==='已全额回款',color:'#10B981'},{label:'延期',filter:n=>n.nodeStatus==='延期',color:'var(--red)'},{label:'正常实施中',filter:n=>n.nodeStatus==='正常实施中',color:'var(--blue)'}];const c2=getVisibleCols(curTier,'plan');renderPlanBoards(an,bd,c2.filter(c=>c.visible),c2);}

function togglePlanCol(idx){

  const cols=getVisibleCols(curTier,'plan');

  cols[idx].visible=!cols[idx].visible;

  saveVisibleCols(curTier,'plan',cols);

  const allNodes=tierNodes(curTier).filter(n=>n.isPaymentRelated);

  const boards=[

    {label:'加资源可提前',filter:n=>n.nodeStatus==='加资源可提前',color:'var(--primary)'},

    {label:'达到回款条件',filter:n=>n.nodeStatus==='达到回款条件',color:'#F59E0B'},

    {label:'已提前回款',filter:n=>n.nodeStatus==='已提前回款',color:'#059669'},

    {label:'已全额回款',filter:n=>n.nodeStatus==='已全额回款',color:'#10B981'},

    {label:'延期',filter:n=>n.nodeStatus==='延期',color:'var(--red)'},

    {label:'正常实施中',filter:n=>n.nodeStatus==='正常实施中',color:'var(--blue)'}

  ];

  const cols2=getVisibleCols(curTier,'plan');

  renderPlanBoards(allNodes,boards,cols2.filter(c=>c.visible),cols2);

}


function updatePlanSummary(filteredNodes, boardAgg){
  var el=document.getElementById('planSummaryBar');
  if(!el)return;
  var related=filteredNodes.filter(function(n){return n.isPaymentRelated});
  var canAdvNodes=related.filter(function(n){return n.nodeStatus==='加资源可提前'});
  var reachedCondNodes=related.filter(function(n){return n.nodeStatus==='达到回款条件'});
  var advNodes=related.filter(function(n){return n.nodeStatus==='已提前回款'});
  var fullPaidNodes=related.filter(function(n){return n.nodeStatus==='已全额回款'});
  var delayedNodes=related.filter(function(n){return n.nodeStatus==='延期'});
  var onTimeNodes=related.filter(function(n){return n.nodeStatus==='正常实施中'});
  // Use aggregated data from sub-boards if available, otherwise compute from filteredNodes
  var totalExp, totalAct, totalRem;
  if(boardAgg && boardAgg.totalExp !== undefined){
    totalExp=boardAgg.totalExp;
    totalAct=boardAgg.totalAct;
    totalRem=boardAgg.totalRem;
  } else {
    totalExp=related.reduce(function(s,n){return s+(n.expectedPayment||0)},0);
    totalAct=related.reduce(function(s,n){return s+(n.actualPayment||0)},0);
    totalRem=totalExp-totalAct;
  }
  var rate=totalExp>0?totalAct/totalExp:0;
  var expW=totalExp;
  var actW=totalAct;
  var remW=totalRem;
  el.innerHTML=`
    <div class="summary-item"><div class="label">节点计划回款金额（万）</div><div class="value" style="color:var(--blue)">${fmtWan(expW)}</div></div>
    <div class="summary-item"><div class="label">节点已回款金额（万）</div><div class="value" style="color:var(--green)">${fmtWan(actW)}</div></div>
    <div class="summary-item"><div class="label">节点待回款金额（万）</div><div class="value" style="color:var(--red)">${fmtWan(remW)}</div></div>
    <div class="summary-item"><div class="label">完成率</div><div class="value" style="color:${rate>=0.8?'var(--green)':rate>=0.5?'var(--orange)':'var(--red)'}">${pct(rate)}</div></div>`;
  var sg=document.getElementById('planStatusGrid');
  if(sg){
    sg.innerHTML=`
    <div class="plan-status-card"><div class="label">加资源可提前</div><div class="value" style="color:var(--primary)">${canAdvNodes.length}</div></div>
    <div class="plan-status-card"><div class="label">达到回款条件</div><div class="value" style="color:#F59E0B">${reachedCondNodes.length}</div></div>
    <div class="plan-status-card"><div class="label">已提前回款</div><div class="value" style="color:#059669">${advNodes.length}</div></div>
    <div class="plan-status-card"><div class="label">已全额回款</div><div class="value" style="color:#10B981">${fullPaidNodes.length}</div></div>
    <div class="plan-status-card"><div class="label">延期</div><div class="value" style="color:var(--red)">${delayedNodes.length}</div></div>
    <div class="plan-status-card"><div class="label">正常实施中</div><div class="value" style="color:var(--blue)">${onTimeNodes.length}</div></div>`;
  }
}

const _statusKeyMap={'canAdvance':0,'reachedCondition':1,'advance':2,'fullPaid':3,'delayed':4,'onTime':5};

function renderPlanBoards(allNodes,boards,visCols,allCols){

  const container=document.getElementById('planBoards');

  if(!container)return;

  // 年份过滤已由tierNodes()->getFilteredNodes()完成，无需重复过滤

  const drillIdx=_drillFilter.status?_statusKeyMap[_drillFilter.status]:-1;

  container.innerHTML=boards.map((b,idx)=>{

    const isDrillTarget=drillIdx===idx;

    const nodes=CF.filterData('planBoard_'+idx,allNodes.filter(b.filter));

    const count=nodes.length;

    const totalAmt=nodes.reduce((s,n)=>s+(n.expectedPayment||0),0);

    const totalAct=nodes.reduce((s,n)=>s+(n.actualPayment||0),0);

    const remaining=totalAmt-totalAct;

    const rate=totalAmt>0?totalAct/totalAmt:0;

    const amtW=totalAmt;

    const actW=totalAct;

    const remW=remaining;

    return `<div class="plan-board${isDrillTarget?' plan-board-highlight':''}" id="${isDrillTarget?'drillTarget':'planBoard_'+idx}">

      <div class="plan-board-header" style="background:${b.color}">${b.label}${isDrillTarget?'<span style="float:right;font-size:11px;opacity:.8">↓ 来自看板下钻</span>':''}</div>

      <div class="plan-board-stats">

        <div class="ps"><div class="ps-label">节点总数</div><div class="ps-val">${count}</div></div>

        <div class="ps"><div class="ps-label">节点计划回款金额（万）</div><div class="ps-val" style="color:var(--blue)">${fmtWan(amtW)}</div></div>
        <div class="ps"><div class="ps-label">节点已回款金额（万）</div><div class="ps-val" style="color:var(--green)">${fmtWan(actW)}</div></div>

        <div class="ps"><div class="ps-label">节点待回款金额（万）</div><div class="ps-val" style="color:${remW>0?'var(--red)':'var(--green)'}">${fmtWan(remW)}</div></div>

        <div class="ps"><div class="ps-label">节点完成率</div><div class="ps-val" style="color:${rate>=0.8?'var(--green)':rate>=0.5?'var(--orange)':'var(--red)'}">${pct(rate)}</div></div>

      </div>

      <div class="plan-board-table"><table class="data-table">${_colGroupHtml(visCols)}<thead><tr>${visCols.map(c=>'<th class="'+_colClass(c.key)+'">'+c.label+CF.renderIcon('planBoard_'+idx,c.key)+'</th>').join('')}</tr></thead><tbody>

      ${nodes.slice(0,100).map(n=>`<tr>${visCols.map(c=>fmtCell(n,c.key)).join('')}</tr>`).join('')}

      </tbody></table></div>

      <div class="plan-board-footer">共 ${count} 条记录</div>

    </div>`;

  }).join('');

  const cv=document.getElementById('plcv');

  if(cv)cv.innerHTML=`<div style="display:flex;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-light)"><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="selectAllPlanCols()">全选</button><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="deselectAllPlanCols()">取消全选</button></div>`+allCols.map((c,i)=>`<label><input type="checkbox" ${c.visible?'checked':''} onchange="togglePlanCol(${i})"> ${c.label}</label>`).join('');


  // Update plan clear button
  var planClearEl=document.getElementById('planClearBtn');
  if(planClearEl){
    var hasPlanFilter=false;
    for(var pi=0;pi<6;pi++){if(CF.hasFilters('planBoard_'+pi)){hasPlanFilter=true;break}}
    planClearEl.innerHTML=hasPlanFilter?'<button class="btn btn-outline" style="font-size:11px;padding:2px 10px;color:var(--red);border-color:var(--red-200)" onclick="for(var i=0;i<6;i++)CF.clearAll(\'planBoard_\'+i)">清除所有筛选</button>':'';
  }

  // Update plan summary bar with combined filtered data from all boards
  var _combinedNodes=[];var _boardAgg={totalExp:0,totalAct:0,totalRem:0};
  boards.forEach(function(b,idx){
    var bNodes=CF.filterData('planBoard_'+idx,allNodes.filter(b.filter));
    // No dedup — match sub-board table which shows raw nodes
    _combinedNodes=_combinedNodes.concat(bNodes);
    _boardAgg.totalExp+=bNodes.reduce(function(s,n){return s+(n.expectedPayment||0)},0);
    _boardAgg.totalAct+=bNodes.reduce(function(s,n){return s+(n.actualPayment||0)},0);
    _boardAgg.totalRem+=bNodes.reduce(function(s,n){return s+((n.expectedPayment||0)-(n.actualPayment||0))},0);
  });
  updatePlanSummary(_combinedNodes.length>0?_combinedNodes:allNodes,_boardAgg);
}



function renderRisk(c,projs,nodes){

  const now=new Date();

  const d7=new Date(now.getTime()+7*864e5);

  const related=nodes.filter(n=>n.isPaymentRelated);

  const nearDue=related.filter(n=>n.planDate&&(pctToNum(n.actualPaymentRatio)===null||pctToNum(n.actualPaymentRatio)<1)).filter(n=>{try{const d=new Date(n.planDate);return d>=now&&d<=d7}catch{return false}}).sort((a,b)=>(a.planDate||'').localeCompare(b.planDate||''));

  const canAdvNotAct=related.filter(n=>n.nodeStatus==='加资源可提前');

  const highRisk=projs.filter(p=>p.paymentRatio!==null&&p.paymentRatio<0.3).sort((a,b)=>(b.projectAmount||0)-(a.projectAmount||0)).slice(0,10);

  c.innerHTML=`

  <div class="card"><div class="card-header" style="color:var(--orange)">临近到期节点 <span style="font-weight:400;font-size:12px;color:var(--gray)">7天内到期且未100%回款</span></div><div class="card-body"><div id="riskNearDueClearBtn" style="margin-bottom:8px">${CF.renderClearBtn('riskNearDue')}</div><div class="table-wrap" style="max-height:360px"><table class="data-table"><thead><tr><th>项目编号${CF.renderIcon('riskNearDue','projectId')}</th><th>项目名称${CF.renderIcon('riskNearDue','projectName')}</th><th>计划日期${CF.renderIcon('riskNearDue','planDate')}</th><th style="text-align:right">待回款(元)${CF.renderIcon('riskNearDue','remainAmount')}</th><th>实际比例${CF.renderIcon('riskNearDue','actualPaymentRatio')}</th><th>服务组${CF.renderIcon('riskNearDue','orgL4')}</th></tr></thead><tbody>
  
  ${nearDue.slice(0,30).map(n=>{const ew=getNodeRemainingWan(n);return `<tr><td class="td-project-id">${n.projectId}</td><td class="td-project-name" title="${n.projectName||''}">${truncName(n.projectName||'-')}</td><td style="font-family:var(--font-mono)">${n.planDate||'-'}</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--blue)">${fmtYuan(ew)}</td><td>${fmtRatio(n.actualPaymentRatio,'待上报')}</td><td>${n.orgL4||'-'}</td></tr>`}).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--green);padding:20px">7天内无临近到期节点</td></tr>'}

  </tbody></table></div><div class="table-record-count">共 ${nearDue.length} 条记录</div></div></div>

  <div class="card"><div class="card-header" style="color:var(--primary)">可提前但未行动 <span style="font-weight:400;font-size:12px;color:var(--gray)">具备提前完成条件但未行动</span></div><div class="card-body"><div id="riskCanAdvClearBtn" style="margin-bottom:8px">${CF.renderClearBtn('riskCanAdv')}</div><div class="table-wrap" style="max-height:360px"><table class="data-table"><thead><tr><th>项目编号${CF.renderIcon('riskCanAdv','projectId')}</th><th>项目名称${CF.renderIcon('riskCanAdv','projectName')}</th><th>计划日期${CF.renderIcon('riskCanAdv','planDate')}</th><th style="text-align:right">待回款(元)${CF.renderIcon('riskCanAdv','remainAmount')}</th><th>实际比例${CF.renderIcon('riskCanAdv','actualPaymentRatio')}</th><th>服务组${CF.renderIcon('riskCanAdv','orgL4')}</th></tr></thead><tbody>
  
  ${canAdvNotAct.slice(0,30).map(n=>{const ew=getNodeRemainingWan(n);return `<tr><td class="td-project-id">${n.projectId}</td><td class="td-project-name" title="${n.projectName||''}">${truncName(n.projectName||'-')}</td><td style="font-family:var(--font-mono)">${n.planDate||'-'}</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--blue)">${fmtYuan(ew)}</td><td>${fmtRatio(n.actualPaymentRatio,'待上报')}</td><td>${n.orgL4||'-'}</td></tr>`}).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--gray);padding:20px">暂无可提前但未行动的节点</td></tr>'}

  </tbody></table></div><div class="table-record-count">共 ${canAdvNotAct.length} 条记录</div></div></div>

  <div class="card"><div class="card-header" style="color:var(--red)">高金额低完成率 <span style="font-weight:400;font-size:12px;color:var(--gray)">回款完成率<30%且金额最高</span></div><div class="card-body"><div id="riskHighRiskClearBtn" style="margin-bottom:8px">${CF.renderClearBtn('riskHighRisk')}</div><div class="table-wrap" style="max-height:360px"><table class="data-table"><thead><tr><th>项目编号${CF.renderIcon('riskHighRisk','projectId')}</th><th>项目名称${CF.renderIcon('riskHighRisk','projectName')}</th><th style="text-align:right">项目金额(元)${CF.renderIcon('riskHighRisk','projectAmount')}</th><th style="text-align:right">待回款金额(元)${CF.renderIcon('riskHighRisk','remainAmount')}</th><th>完成率${CF.renderIcon('riskHighRisk','paymentRatio')}</th><th>服务组${CF.renderIcon('riskHighRisk','orgL4')}</th></tr></thead><tbody>
  
  ${highRisk.map(p=>{const aw=(p.projectAmount||0);const rw=(p.remainingAmount||0);const rc=p.paymentRatio<0.1?'var(--red)':p.paymentRatio<0.2?'var(--orange)':'var(--primary)';return `<tr><td class="td-project-id">${p.projectId}</td><td class="td-project-name" title="${p.projectName||''}">${truncName(p.projectName||'-')}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(aw)}</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--red)">${fmtYuan(rw)}</td><td style="color:${rc};font-weight:700">${pct(p.paymentRatio)}</td><td>${p.orgL4||'-'}</td></tr>`}).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--green);padding:20px">无高金额低完成率项目</td></tr>'}

  </tbody></table></div><div class="table-record-count">共 ${highRisk.length} 条记录</div></div></div>`;

}
CF.register('riskNearDue',function(){renderTier()},function(){var n=tierNodes(curTier).filter(function(n){return n.isPaymentRelated});var now=new Date();var d7=new Date(now.getTime()+7*864e5);return n.filter(function(n){return n.planDate&&(pctToNum(n.actualPaymentRatio)===null||pctToNum(n.actualPaymentRatio)<1)}).filter(function(n){try{var d=new Date(n.planDate);return d>=now&&d<=d7}catch{return false}})});
CF.register('riskCanAdv',function(){renderTier()},function(){return tierNodes(curTier).filter(function(n){return n.isPaymentRelated&&n.nodeStatus==='加资源可提前'})});
CF.register('riskHighRisk',function(){renderTier()},function(){return groupByProject(tierNodes(curTier)).filter(function(p){return p.paymentRatio!==null&&p.paymentRatio<0.3})});




// === Compare ===

function initCompare(){

  const pageEl=document.getElementById('page-compare');

  if(!pageEl)return;

  const tiers=['100万以上','50-100万','50万以下'];

  const tierColors={'100万以上':'#EF4444','50-100万':'#F59E0B','50万以下':'#10B981'};

  const tierAccents={'100万以上':'accent-red','50-100万':'accent-orange','50万以下':'accent-green'};

  // Compute stats

  const stats=tiers.map(t=>{

    const s=D.summary[t]||{};

    // Use actualAmountWan/expectedAmountWan for correct completion rate (not totalAmountWan - remainingAmountWan)

    const tierRelated=D.rawNodes.filter(n=>n.tier===t&&n.isPaymentRelated);

    const tierActualWan=s.actualAmountWan||tierRelated.reduce((s,n)=>s+(n.actualPayment||0),0)/10000;

    const tierExpectedWan=s.expectedAmountWan||tierRelated.reduce((s,n)=>s+(n.expectedPayment||0),0)/10000;

    const rate=tierExpectedWan>0?tierActualWan/tierExpectedWan:0;

    const delayRate=s.relatedNodeCount>0?(s.delayedCount/s.relatedNodeCount):0;

    return {...s,tier:t,actualAmountWan:tierActualWan,expectedAmountWan:tierExpectedWan,completionRate:rate,delayRate:delayRate};

  });

  // Build comparison cards

  let cardsHtml='<div class="compare-cards">'+tiers.map((t,i)=>{

    const s=stats[i];

    const rate=s.completionRate;

    const rc=rate>=0.8?'var(--green)':rate>=0.5?'var(--orange)':'var(--red)';

    return `<div class="compare-card"><div class="compare-card-accent ${tierAccents[t]}"></div>

      <div class="compare-card-title">${t}</div>

      <div class="compare-metrics">

        <div class="compare-metric"><span class="compare-ml">项目数</span><span class="compare-mv" style="color:var(--dark)">${s.projectCount||0}</span></div>

        <div class="compare-metric"><span class="compare-ml">计划回款总金额(万)</span><span class="compare-mv" style="color:var(--blue)">${fmtYuan(s.totalAmountWan)}</span></div>

        <div class="compare-metric"><span class="compare-ml">待回款总金额(万)</span><span class="compare-mv" style="color:var(--red)">${fmtYuan(s.remainingAmountWan)}</span></div>

        <div class="compare-metric"><span class="compare-ml">完成率</span><span class="compare-mv" style="color:${rc}">${pct(rate)}</span></div>

        <div class="compare-metric"><span class="compare-ml">延期率</span><span class="compare-mv" style="color:${s.delayRate>0.2?'var(--red)':s.delayRate>0.1?'var(--orange)':'var(--green)'}">${pct(s.delayRate)}</span></div>

      </div></div>`;

  }).join('')+'</div>';

  // Build page HTML

  pageEl.innerHTML=`<div style="padding:20px">

    <div class="card"><div class="card-header" style="color:var(--primary)">回款达成对比看板</div><div class="card-body">${cardsHtml}</div></div>

    <div class="two-col">

      <div class="card"><div class="card-header">回款进度对比</div><div class="card-body"><div id="compareProgressChart" style="height:320px"></div></div></div>

      <div class="card"><div class="card-header">状态分布对比</div><div class="card-body"><div id="compareStatusChart" style="height:320px"></div></div></div>

    </div>

    <div class="card"><div class="card-header">月度回款趋势对比</div><div class="card-body"><div id="compareTrendChart" style="height:360px"></div></div></div>

    <div class="card"><div class="card-header">服务组达成率排名</div><div class="card-body"><div id="compareOrgChart" style="height:400px"></div></div></div>

  </div>`;

  // Chart 1: Grouped bar - payment progress by tier

  try{

    const ch1=regChart(echarts.init(document.getElementById('compareProgressChart'),'ent'));

    ch1.setOption({

      tooltip:{trigger:'axis',axisPointer:{type:'shadow'}},

      legend:{data:['已回款','待回款','延期金额']},

      grid:{left:60,right:30,top:30,bottom:55},

      xAxis:{type:'category',data:tiers,axisLabel:{color:'#334155',fontWeight:600}},

      yAxis:{type:'value',name:'金额(万)',axisLabel:{color:'#334155'},nameTextStyle:{color:'#334155',fontWeight:'bold',fontSize:12},nameGap:8},

      series:[

        {name:'已回款',type:'bar',data:tiers.map((t,i)=>{return fmt(stats[i].actualAmountWan||0)}),itemStyle:{color:'#10B981'},barWidth:CHART_BAR_WIDTH,barCategoryGap:CHART_BAR_CATEGORY_GAP},

        {name:'待回款',type:'bar',data:tiers.map((t,i)=>stats[i].remainingAmountWan||0),itemStyle:{color:'#F59E0B'}},

        {name:'延期金额',type:'bar',data:tiers.map((t,i)=>stats[i].delayedAmount||0),itemStyle:{color:'#EF4444',borderRadius:[4,4,0,0]}}

      ]

    });

  }catch(e){console.error('compareProgressChart error:',e)}

  // Chart 2: Stacked bar - status distribution

  try{

    const ch2=echarts.init(document.getElementById('compareStatusChart'),'ent');

    _charts.push(ch2);

    const statuses=['加资源可提前','达到回款条件','已提前回款','已全额回款','延期','正常实施中'];

    const statusColors=['#6366F1','#F59E0B','#059669','#10B981','#EF4444','#3B82F6'];

    ch2.setOption({

      tooltip:{trigger:'axis',axisPointer:{type:'shadow'}},

      legend:{data:statuses,bottom:0},

      grid:{left:60,right:30,top:25,bottom:60},

      xAxis:{type:'category',data:tiers,axisLabel:{color:'#334155',fontWeight:600}},

      yAxis:{type:'value',name:'节点数',axisLabel:{color:'#334155'},nameTextStyle:{color:'#334155',fontWeight:'bold',fontSize:12},nameGap:8},

      series:statuses.map((st,si)=>({

        name:st,type:'bar',stack:'a',

        data:tiers.map(t=>{const s=D.summary[t]||{};if(st==='正常实施中')return s.onTimeCount||0;if(st==='已提前回款')return s.advanceEarlyCount||0;if(st==='已全额回款')return s.fullPaidCount||0;if(st==='加资源可提前')return s.canAdvanceCount||0;if(st==='达到回款条件')return s.reachedConditionCount||0;if(st==='延期')return s.delayedCount||0;const rel=(s.relatedNodeCount||0)-(s.onTimeCount||0)-(s.advanceEarlyCount||0)-(s.delayedCount||0);return rel>0?rel:0}),

        itemStyle:{color:statusColors[si]},

        ...(si===statuses.length-1?{itemStyle:{color:statusColors[si],borderRadius:[4,4,0,0]}}:{})

      }))

    });

  }catch(e){console.error('compareStatusChart error:',e)}

  // Chart 3: Monthly trend lines

  try{

    const ch3=echarts.init(document.getElementById('compareTrendChart'),'ent');

    _charts.push(ch3);

    const ms=new Set(),td={};

    tiers.forEach(t=>{const mp=(D.summary[t]||{}).monthlyPlan||{};td[t]=mp;Object.keys(mp).forEach(m=>ms.add(m))});

    const months=[...ms].sort().filter(m=>m<='2027-12');

    ch3.setOption({

      tooltip:{trigger:'axis'},

      legend:{data:tiers,bottom:0},

      grid:{left:60,right:30,top:25,bottom:60},

      xAxis:{type:'category',data:months,axisLabel:{color:'#334155',fontWeight:500,rotate:months.length>12?30:0}},

      yAxis:{type:'value',name:'金额(万)',axisLabel:{color:'#334155'},nameTextStyle:{color:'#334155',fontWeight:'bold',fontSize:12},nameGap:8},

      series:tiers.map((t,i)=>({

        name:t,type:'line',smooth:true,

        data:months.map(m=>((td[t]||{})[m]||{}).amountWan||0),

        itemStyle:{color:tierColors[t]},

        lineStyle:{width:2}

      }))

    });

  }catch(e){console.error('compareTrendChart error:',e)}

  // Chart 4: Org ranking TOP5/BOTTOM5 - HTML rank list matching dashboard style

  try{

    const orgEl=document.getElementById('compareOrgChart');

    const org=D.dashboard.orgRanking||[];

    const sorted=[...org].sort((a,b)=>b.achievementRate-a.achievementRate);

    const t5=sorted.slice(0,5),b5=sorted.slice(-5).reverse();

    const mx=Math.max(...sorted.map(s=>s.actualTotal),1);

    function rankList(items,title,titleColor){

      return `<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:${titleColor};margin-bottom:10px;padding-left:4px">${title}</div>${items.map((v,i)=>{

        const medal='';

        const rank=medal||(i+1);

        const bw=(v.actualTotal/mx*100).toFixed(1);

        const bc=v.achievementRate>=.45?'linear-gradient(90deg,#10B981,#34D399)':v.achievementRate>=.3?'linear-gradient(90deg,#F59E0B,#FBBF24)':'linear-gradient(90deg,#EF4444,#F87171)';

        const rc=v.achievementRate>=.45?'var(--green)':v.achievementRate>=.3?'var(--orange)':'var(--red)';

        return `<div class="rank-item"><div class="rank-badge">${rank}</div><div class="rank-name" title="${v.org}">${v.org.length>8?v.org.slice(0,8)+'…':v.org}</div><div class="rank-bar-wrap"><div class="rank-bar" style="width:${bw}%;background:${bc}"></div></div><div class="rank-amount">${fmtW(v.actualTotalWan)}</div><div class="rank-rate" style="color:${rc}">${pct(v.achievementRate)}</div></div>`;

      }).join('')}</div>`;

    }

    orgEl.parentElement.innerHTML=`<div style="display:flex;gap:24px">${rankList(t5,'TOP5','#10B981')}${rankList(b5,'BOTTOM5','#EF4444')}</div>`;

  }catch(e){console.error('compareOrgChart error:',e)}

}



// === Data Page ===

function initData(){

  const ns=D.rawNodes,rel=ns.filter(n=>n.isPaymentRelated);

  const tiers=['100万以上','50-100万','50万以下'];

  const checks=[

    {n:'缺少项目金额',c:ns.filter(n=>!n.projectAmount).length,s:'h',byTier:tiers.map(t=>ns.filter(n=>n.tier===t&&!n.projectAmount).length)},

    {n:'实际回款比例待上报',c:rel.filter(n=>pctToNum(n.actualPaymentRatio)===null).length,s:'m',byTier:tiers.map(t=>rel.filter(n=>n.tier===t&&pctToNum(n.actualPaymentRatio)===null).length)},

    {n:'缺少项目经理',c:ns.filter(n=>!n.projectManager).length,s:'m',byTier:tiers.map(t=>ns.filter(n=>n.tier===t&&!n.projectManager).length)},

    {n:'缺少服务组',c:ns.filter(n=>!n.orgL4).length,s:'l',byTier:tiers.map(t=>ns.filter(n=>n.tier===t&&!n.orgL4).length)},

    {n:'回款比例>100%',c:rel.filter(n=>pctToNum(n.actualPaymentRatio)!==null&&pctToNum(n.actualPaymentRatio)>1).length,s:'h',byTier:tiers.map(t=>rel.filter(n=>n.tier===t&&pctToNum(n.actualPaymentRatio)!==null&&pctToNum(n.actualPaymentRatio)>1).length)},

    {n:'状态为"待确定"',c:rel.filter(n=>false).length,s:'m',byTier:tiers.map(t=>rel.filter(n=>n.tier===t&&false).length)}

  ];

  document.getElementById('dataCheck').innerHTML=`<table class="data-table" style="width:100%"><thead><tr><th>检查项</th><th style="text-align:center">100万以上</th><th style="text-align:center">50-100万</th><th style="text-align:center">50万以下</th><th style="text-align:center">合计</th></tr></thead><tbody>

  ${checks.map((c,ci)=>{const cl=c.s==='h'?'var(--red)':c.s==='m'?'var(--orange)':'var(--gray)';const tc=c.c>0?cl:'var(--green)';return `<tr><td><span class="risk-dot" style="background:${cl};display:inline-block;vertical-align:middle;margin-right:8px"></span>${c.n}</td>${c.byTier.map((v,ti)=>`<td style="text-align:center;font-family:var(--font-mono);font-weight:700;color:${v>0?tc:'var(--green)'};cursor:${v>0?'pointer':'default'}" onclick="${v>0?'showDataDrill('+ci+','+ti+')':''}">${v}</td>`).join('')}<td style="text-align:center;font-family:var(--font-mono);font-weight:700;color:${tc};cursor:${c.c>0?'pointer':'default'}" onclick="${c.c>0?'showDataDrill('+ci+',-1)':''}">${c.c}</td></tr>`}).join('')}

  </tbody></table>`;

  // 数据缺失检查按钮 - now inline with 数据质量总览 header

}



// === Dynamic Data Reload (no page refresh) ===

function reloadData(){
  /* 动态重新加载 analysis_data.js（带时间戳参数绕过浏览器缓存），
     更新内存中的 D 对象，然后刷新所有页面视图，无需整页刷新 */
  var ts=Date.now();
  var script=document.createElement('script');
  script.src='data/analysis_data.js?t='+ts;
  script.onload=function(){
    /* 新脚本加载后，全局变量 ANALYSIS_DATA 已被更新为最新数据 */
    if(typeof ANALYSIS_DATA!=='undefined'&&ANALYSIS_DATA.rawNodes&&ANALYSIS_DATA.rawNodes.length>0){
      /* 将最新数据拷贝到 D 对象（保留 displayColumns 等平台配置） */
      D.meta=ANALYSIS_DATA.meta||{};
      D.dashboard=ANALYSIS_DATA.dashboard||{};
      D.summary=ANALYSIS_DATA.summary||{};
      D.rawNodes=ANALYSIS_DATA.rawNodes||[];
      if(ANALYSIS_DATA.displayColumns)D.displayColumns=ANALYSIS_DATA.displayColumns;
      /* 更新右上角数据同步时间 */
      document.getElementById('updateTime').textContent=D.meta.lastUpdate||'-';
      /* 刷新所有视图 */
      initDash();
      initData();
      /* 刷新当前页面 */
      if(curPage==='tier')renderTier();
      else if(curPage==='ledger')initLedger();
      else if(curPage==='calendar')initCalendarPage();
      else if(curPage==='followup')initFollowup();
      else if(curPage==='pmview')initPmView();
      else if(curPage==='compare')initCompare();
      /* 更新年份和视角dock */
      updateYearDockVisibility();
      updateViewDockVisibility();
      positionViewDock();
      /* 更新进度提示文字，告知用户刷新已完成 */
      const ipt=document.getElementById('importProgressText');
      const spt=document.getElementById('syncProgressText');
      if(ipt&&ipt.textContent.includes('刷新数据'))ipt.textContent='导入完成！数据已更新';
      if(spt&&spt.textContent.includes('刷新数据'))spt.textContent='同步完成！数据已更新';
      console.log('[reloadData] 数据已热更新，lastUpdate='+D.meta.lastUpdate);
    }else{
      /* 加载的数据为空或无效，仍需刷新（可能数据被清空） */
      D.meta=ANALYSIS_DATA&&ANALYSIS_DATA.meta?ANALYSIS_DATA.meta:{};
      D.dashboard={};
      D.summary={};
      D.rawNodes=[];
      document.getElementById('updateTime').textContent=D.meta.lastUpdate||'-';
      initDash();initData();
      if(curPage==='tier')renderTier();
      else if(curPage==='ledger')initLedger();
      else if(curPage==='followup')initFollowup();
      else if(curPage==='calendar')initCalendarPage();
    }
    /* 清理动态脚本标签 */
    script.remove();
  };
  script.onerror=function(){
    /* 动态加载失败，降级为整页刷新 */
    console.warn('[reloadData] 动态加载失败，降级为 location.reload()');
    script.remove();
    location.reload();
  };
  document.head.appendChild(script);
}

// === Sync ===

function startSync(){

  const urlInput=document.getElementById('syncUrl');

  const docUrl=urlInput?urlInput.value.trim():'';

  if(!docUrl){alert('请先输入数据源地址（WPS云文档网址）');if(urlInput)urlInput.focus();return}

  const btn=document.getElementById('syncBtn');

  const progress=document.getElementById('syncProgress');

  const fill=document.getElementById('syncProgressFill');

  const text=document.getElementById('syncProgressText');

  btn.disabled=true;btn.textContent='同步中...';document.getElementById('stopSyncBtn').style.display='';document.getElementById('importBtn').disabled=true;

  progress.classList.add('show');fill.style.width='0%';fill.style.background='#3B82F6';text.textContent='正在连接WPS云文档...';

  const syncApiUrl=(location.protocol==='file:'?'http://localhost:8080':'')+'/api/sync?url='+encodeURIComponent(docUrl);

  window._syncEvtSource=new EventSource(syncApiUrl);const evtSource=window._syncEvtSource;

  evtSource.onmessage=function(e){

    const data=JSON.parse(e.data);fill.style.width=data.progress+'%';text.textContent=data.message;

if(data.progress>=100){evtSource.close();btn.disabled=false;btn.textContent='同步最新数据';document.getElementById('stopSyncBtn').style.display='none';document.getElementById('importBtn').disabled=false;fill.style.background='#10B981';text.textContent='同步完成！正在刷新数据...';setTimeout(()=>reloadData(),500)}

  };

  evtSource.onerror=function(){

    evtSource.close();fill.style.width='100%';fill.style.background='#EF4444';

    text.innerHTML=`<div style="font-size:13px;line-height:1.8">同步连接中断，请检查以下事项后重试：<br>1. 确认已安装 <b>Google Chrome</b> 或 <b>Microsoft Edge</b> 浏览器<br>2. 确认输入的云文档地址正确且有访问权限<br>3. 确认网络连接正常，可访问云文档平台<br>4. 如问题持续，请关闭应用后重新启动</div>`;

    btn.disabled=false;btn.textContent='同步最新数据';

  };

}



function clearData(){

  if(!confirm('确定要清空所有数据吗？\n\n此操作将删除系统中所有已加载的项目和回款数据，清空后需重新同步才能恢复。')){

    return;

  }

  if(!confirm('再次确认：是否清空所有数据？此操作不可撤销！')){

    return;

  }

  // Clear only business data, keep platform config

  D.rawNodes=[];

  D.summary={};

  D.dashboard={};

  // Keep D.meta (metadata), D.displayColumns (table config) - these are platform config, not business data

  // Also clear ANALYSIS_DATA business data if accessible

  if(typeof ANALYSIS_DATA!=='undefined'){ANALYSIS_DATA.rawNodes=[];ANALYSIS_DATA.summary={};ANALYSIS_DATA.dashboard={}}

  filterYear='all';

  // Re-render all pages

  initDash();

  initData();

  // Also delete the data file on server

  const clearUrl=location.protocol==='file:'?'http://localhost:8080/api/clear-data':'/api/clear-data';

  let serverCleared=false;

  fetch(clearUrl).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(d=>{

    serverCleared=d.success;

    const btn=document.getElementById('clearBtn');

    if(serverCleared){

      btn.textContent='已清空(含数据文件)';

    }else{

      btn.textContent='内存已清空';

    }

    console.log('服务器数据文件清理:',d.message);

  }).catch(err=>{

    const btn=document.getElementById('clearBtn');

    btn.textContent='内存已清空';

    console.log('服务器未运行，仅清空内存数据。如需删除数据文件，请双击 sync_data.bat 或启动服务后重试。',err);

  });

  // Show success

  const btn=document.getElementById('clearBtn');

  btn.textContent='已清空';

  btn.disabled=true;

  setTimeout(()=>{btn.textContent='清空数据';btn.disabled=false},2000);

  // Update header

  document.getElementById('updateTime').textContent='数据已清空';

}



// === About Page ===


// ─── 停止服务（前端页面停止按钮）─────────────────────────────
function stopServer(){
  if(!confirm('确认停止服务？停止后需重新启动exe'))return;
  const btn=document.getElementById('stopServerBtn');
  if(btn){btn.disabled=true;btn.style.opacity='0.5'}
  const baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
  fetch(baseUrl+'/api/stop').then(function(r){return r.json()}).then(function(d){
    document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#F8FAFC;font-family:Inter,Noto Sans SC,sans-serif"><div style="text-align:center"><div style="font-size:48px;margin-bottom:16px;color:#94A3B8">&#9632;</div><div style="font-size:20px;font-weight:700;color:#334155;margin-bottom:8px">服务已停止</div><div style="font-size:14px;color:#64748B">请重新启动exe以恢复服务</div></div></div>';
  }).catch(function(){
    document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#F8FAFC;font-family:Inter,Noto Sans SC,sans-serif"><div style="text-align:center"><div style="font-size:48px;margin-bottom:16px;color:#94A3B8">&#9632;</div><div style="font-size:20px;font-weight:700;color:#334155;margin-bottom:8px">服务已停止</div><div style="font-size:14px;color:#64748B">请重新启动exe以恢复服务</div></div></div>';
  });
}

// ─── 停止同步 ─────────────────────────────────────────────
function stopSync(){
  if(typeof _syncEvtSource!=='undefined'&&_syncEvtSource){_syncEvtSource.close();_syncEvtSource=null}
  const btn=document.getElementById('syncBtn');
  const stopBtn=document.getElementById('stopSyncBtn');
  const fill=document.getElementById('syncProgressFill');
  const text=document.getElementById('syncProgressText');
  btn.disabled=false;btn.textContent='同步最新数据';
  stopBtn.style.display='none';
  document.getElementById('importBtn').disabled=false;
  fill.style.width='0%';fill.style.background='';text.textContent='同步已停止';
  const baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
  fetch(baseUrl+'/api/stop-sync').catch(()=>{});
}

// ─── 离线导入Excel ──────────────────────────────────────────
let _importAbortController=null;
let _importPollTimer=null;

// 离线导入必需的Sheet页名称（V5.9统一：所有层级合并到一张表中）
const REQUIRED_SHEET_NAMES=['项目回款节点（里程碑）清单'];

// ─── 导入错误展示辅助函数 ──────────────────────────────────────
function _showImportError(textEl,fillEl,title,detail,suggestion){
  /* 生成结构化的错误提示HTML，替代简单的textContent
   * title: 错误标题（如"文件格式不符"、"网络连接失败"）
   * detail: 错误详细描述（支持<b>标签强调关键词）
   * suggestion: 解决建议（支持<b>标签强调关键词），可选
   */
  if(!textEl)return;
  textEl.className='sync-progress-text error';
  var html='<div class="err-title"><span class="err-icon">&#10060;</span> '+title+'</div>';
  html+='<div class="err-detail">'+detail+'</div>';
  if(suggestion)html+='<div class="err-suggestion">&#128161; 解决建议：'+suggestion+'</div>';
  textEl.innerHTML=html;
  if(fillEl){fillEl.style.width='100%';fillEl.style.background='var(--red)'}
}

function _clearImportError(textEl,fillEl){
  /* 清除错误样式，恢复为普通进度文本 */
  if(!textEl)return;
  textEl.className='sync-progress-text';
  textEl.innerHTML='';
  if(fillEl){fillEl.style.background=''}
}

function importExcel(){
  const fileInput=document.getElementById('importFile');
  const file=fileInput?fileInput.files[0]:null;
  if(!file){alert('请先选择Excel文件');return}
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext!=='xlsx'&&ext!=='xls'){alert('仅支持 .xlsx 或 .xls 格式的Excel文件');return}
  
  const btn=document.getElementById('importBtn');
  const stopBtn=document.getElementById('stopImportBtn');
  const progress=document.getElementById('importProgress');
  const fill=document.getElementById('importProgressFill');
  const text=document.getElementById('importProgressText');
  
  btn.disabled=true;btn.textContent='导入中...';
  stopBtn.style.display='';
  document.getElementById('syncBtn').disabled=true;
  progress.style.display='';progress.classList.add('show');
  fill.style.width='0%';text.textContent='正在读取Excel文件...';
  
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=new Uint8Array(e.target.result);
      const workbook=XLSX.read(data,{type:'array'});
      
      // ── 上传前验证：检查必需的Sheet页名称 ──
      const missingSheets=REQUIRED_SHEET_NAMES.filter(name=>!workbook.SheetNames.includes(name));
      if(missingSheets.length>0){
        btn.disabled=false;btn.textContent='离线导入';
        stopBtn.style.display='none';
        document.getElementById('syncBtn').disabled=false;
        fill.style.width='100%';fill.style.background='var(--red)';
        text.textContent='✕ 文件缺少必需Sheet页：'+missingSheets.join('、')+'。请确保Excel包含名为"项目回款节点（里程碑）清单"的Sheet页，且名称完全一致';
        return;
      }
      
      const allSheets={};
      workbook.SheetNames.forEach(name=>{
        const ws=workbook.Sheets[name];
        const jsonData=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        // 转为字符串二维数组（与 fetch_yundocs_full.py 格式一致）
        allSheets[name]=jsonData.map(row=>row.map(cell=>cell!==null&&cell!==undefined?String(cell):''));
      });
      fill.style.width='20%';text.textContent='正在上传数据到服务器...';
      
      // POST to server
      const baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
      _importAbortController=new AbortController();
      fetch(baseUrl+'/api/import',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({allSheets:allSheets,fileName:file.name}),
        signal:_importAbortController.signal
      }).then(r=>{
        // ── 改进：先检查HTTP状态码，再解析JSON ──
        if(!r.ok){
          // HTTP错误（如404=服务API路由不可用、500=服务器内部错误）
          const statusHint=r.status===404?'服务API不可用(404)，可能服务未正常启动，请刷新页面或重启服务':
                          r.status===500?'服务器内部错误(500)，请查看服务日志或重启服务':
                          'HTTP错误('+r.status+')，请刷新页面或重启服务后重试';
          throw new Error(statusHint);
        }
        return r.json();
      }).then(res=>{
        if(!res.success){
          btn.disabled=false;btn.textContent='离线导入';
          stopBtn.style.display='none';
          document.getElementById('syncBtn').disabled=false;
          fill.style.width='100%';fill.style.background='var(--red)';
          // 服务端返回的中文错误信息（如"同步正在进行中"、"导入正在进行中"等）
          text.textContent='✕ '+res.message||'导入失败';
          return;
        }
        // 开始轮询导入状态
        fill.style.background='';
        fill.style.width='30%';text.textContent='导入数据已上传，正在处理...';
        _pollImportStatus(baseUrl,fill,text,btn,stopBtn);
      }).catch(err=>{
        if(err.name==='AbortError'){
          fill.style.width='0%';text.textContent='导入已终止';
        }else{
          fill.style.width='100%';fill.style.background='var(--red)';
          // ── 改进：分类展示网络错误与JSON解析错误 ──
          const errMsg=err.message||'';
          if(errMsg.includes('Failed to fetch')||errMsg.includes('NetworkError')||errMsg.includes('Network request failed')){
            text.textContent='✕ 网络连接失败：无法连接到服务器。请确认服务正常运行，可尝试刷新页面或重启服务';
          }else if(errMsg.includes('SyntaxError')||errMsg.includes('JSON')||errMsg.includes('Unexpected token')){
            text.textContent='✕ 服务响应异常：服务器返回了非预期格式的数据(可能服务未正常启动)。请刷新页面或重启服务后重试';
          }else{
            text.textContent='✕ 上传失败: '+errMsg;
          }
        }
        btn.disabled=false;btn.textContent='离线导入';
        stopBtn.style.display='none';
        document.getElementById('syncBtn').disabled=false;
      });
    }catch(err){
      btn.disabled=false;btn.textContent='离线导入';
      stopBtn.style.display='none';
      document.getElementById('syncBtn').disabled=false;
      fill.style.width='100%';fill.style.background='var(--red)';
      text.textContent='✕ Excel解析失败: '+err.message+'。请确认文件为标准Excel格式，且未被加密或损坏';
    }
  };
  reader.readAsArrayBuffer(file);
}

function _pollImportStatus(baseUrl,fill,text,btn,stopBtn){
  let lastProgress=30;
  function poll(){
    fetch(baseUrl+'/api/import-status').then(r=>r.json()).then(state=>{
      if(state.progress>lastProgress){fill.style.width=state.progress+'%';lastProgress=state.progress}
      text.textContent=state.message||'处理中...';
      if(state.progress>=100){
        fill.style.width='100%';fill.style.background='var(--green)';
        text.textContent='导入完成！正在刷新数据...';
        btn.disabled=false;btn.textContent='导入数据';
        stopBtn.style.display='none';
        document.getElementById('syncBtn').disabled=false;
        setTimeout(()=>reloadData(),500);
      }else if(!state.running){
        // 已停止或失败
        btn.disabled=false;btn.textContent='导入数据';
        stopBtn.style.display='none';
        document.getElementById('syncBtn').disabled=false;
        if(state.message&&state.message.includes('失败')){
          fill.style.background='var(--red)';
        }
      }else{
        _importPollTimer=setTimeout(poll,1000);
      }
    }).catch(()=>{
      _importPollTimer=setTimeout(poll,2000);
    });
  }
  poll();
}

function stopImport(){
  // 取消 fetch 请求
  if(_importAbortController){_importAbortController.abort();_importAbortController=null}
  if(_importPollTimer){clearTimeout(_importPollTimer);_importPollTimer=null}
  
  const btn=document.getElementById('importBtn');
  const stopBtn=document.getElementById('stopImportBtn');
  const fill=document.getElementById('importProgressFill');
  const text=document.getElementById('importProgressText');
  
  btn.disabled=false;btn.textContent='导入数据';
  stopBtn.style.display='none';
  document.getElementById('syncBtn').disabled=false;
  fill.style.width='0%';fill.style.background='';text.textContent='导入已停止';
  
  const baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
  fetch(baseUrl+'/api/stop-import').catch(()=>{});
}

function initAbout(){

  const el=document.getElementById('aboutContent');

  if(!el)return;

  el.innerHTML=`<div style="max-width:600px">

    <div style="margin-bottom:24px">

      <div style="font-size:20px;font-weight:800;color:var(--dark);margin-bottom:4px">项目回款跟踪与管控平台</div>

      <div style="font-size:14px;color:var(--gray)">Version ${APP_VERSION}</div>

    </div>

    <div style="display:grid;grid-template-columns:120px 1fr;gap:12px 16px;font-size:13px;border-top:1px solid var(--border-light);padding-top:16px">

      <div style="color:var(--gray);font-weight:600">产品名称</div><div>项目回款跟踪与管控平台</div>

      <div style="color:var(--gray);font-weight:600">版本号</div><div>v${APP_VERSION}</div>

      <div style="color:var(--gray);font-weight:600">发布日期</div><div>2026-06-02</div>

      <div style="color:var(--gray);font-weight:600">作者</div><div>交付中心-交付实施三部-阿童木</div>

      <div style="color:var(--gray);font-weight:600">数据来源</div><div>WPS云文档 - 项目回款节点清单</div>

      <div style="color:var(--gray);font-weight:600">数据更新</div><div>${D.meta.lastUpdate||'-'}</div>

    </div></div>

      </div>

    </div>

    <div style="margin-top:24px;padding:16px;background:var(--gray-50);border-radius:var(--radius-sm);font-size:12px;color:var(--gray)">

      <div style="font-weight:700;margin-bottom:8px;color:var(--dark-3)">功能说明</div>

      <ul style="list-style:disc;padding-left:20px;line-height:2">

        <li>按项目金额区间（100万以上项目/50-100万项目/50万以下项目）分级管理</li>

        <li>侧边栏折叠/展开：菜单栏右下角折叠按钮支持收缩为图标模式，折叠后悬浮显示子菜单</li>

        <li>侧边栏自动同步高亮：下钻跳转页面时侧边栏自动展开父级菜单并高亮当前所在页面</li>

        <li>区间子菜单导航：通过侧边栏子菜单切换不同金额区间，替代页面内区间页签</li>

        <li>看板首页：6种节点状态（加资源可提前/达到回款条件/已提前回款/已全额回款/延期/正常实施中）汇总展示</li>

        <li>季度待回款与月度待回款图表，支持年份/季度切换与下钻</li>

        <li>图表图例点击交互：图例支持点击切换数据系列显隐，便于聚焦特定金额区间数据分析</li>

        <li>图表柱间距统一：三系列柱宽38px、间距19px保持一致，周期切换不再改变柱间距</li>

        <li>PM L3-1部门回款达成排名、延期项目Top10</li>

        <li>周期切换组件跟随侧边栏折叠联动移动</li>

        <li>回款日历：独立年份切换、双月视图、状态热力图、15天/30天到期提醒（含项目经理和距离到期天数）</li>

        <li>回款台账：跨区间统一视图、行内下钻、6种节点状态卡片、区间摘要（计划回款金额/待回款金额）</li>

        <li>项目总览、回款节点、回款状态、风险项目、数据质检</li>

        <li>项目经理视图、区间对比分析</li>

        <li>V5.9 新增：项目分类分布（Treemap）与服务组重点项目分布（中国地图），支持下钻到项目总览</li>
        <li>V5.9 新增：临期跟进（Signal Board）——L4服务组30/15/7天临期回款进度，含展开面板、节点详情下钻</li>
        <li>V5.9 新增：季度回款概览看板（Q1-Q4），周期切换/视角切换联动</li>
        <li>V5.9 新增：纳管筛选开关，支持是/空值展示、否排除，全系统联动</li>
        <li>V5.9 新增：回款日历顶部专属看板（当月回款节点/待回款/已回款/7天到期/延期节点）</li>
        <li>V5.9 优化：项目总览数据源改为项目验收日期Sheet，动态列显示</li>
        <li>V5.9 优化：看板首页下钻到项目总览，支持下钻筛选和返回</li>
        <li>V5.9 优化：中国地图省份按服务组着色，hover高亮，南海诸岛附图</li>
        <li>数据管理：WPS云文档同步（支持停止同步）、离线Excel导入（支持停止上传）、数据缺失检查</li>
        <li>浏览器兼容性：自动检测 Chrome / Edge 浏览器，未安装时给出明确安装提示</li>
        <li>列筛选弹窗增加搜索输入框：支持输入文字快速查找和筛选选项</li>
        <li>支持自定义展示字段、列筛选、多维度搜索、多Sheet Excel导出</li>
        <li>页面停止服务按钮：右上角红色停止按钮可直接停止服务并终止进程</li>

      </ul>

    </div>

  </div>`;

}





// === Missing Page Init Functions ===

function initLedger(){

  const el=document.getElementById('page-ledger');

  if(!el)return;

  // Unified view - no tier separation
  // Use getFilteredNodes() to apply perspective filter (L4/PM view sync)
  const allNodes=getFilteredNodes();

  const allProjs=groupByProject(allNodes);

  const related=allNodes.filter(n=>n.isPaymentRelated);

  const totalExpected=related.reduce((s,n)=>s+(n.expectedPayment||0),0);

  const totalActual=related.reduce((s,n)=>s+(n.actualPayment||0),0);

  const totalRemaining=totalExpected-totalActual;

  const totalRate=totalExpected>0?totalActual/totalExpected:0;

  const remW=totalRemaining;

  const actW=totalActual;

  const expW=totalExpected;

  const paid100=related.filter(n=>pctToNum(n.actualPaymentRatio)!==null&&pctToNum(n.actualPaymentRatio)>=1).length;

  const delayed=related.filter(n=>n.nodeStatus==='延期').length;

  const canAdvance=related.filter(n=>n.nodeStatus==='加资源可提前').length;
  const reachedCondition=related.filter(n=>n.nodeStatus==='达到回款条件').length;
  const advEarly=related.filter(n=>n.nodeStatus==='已提前回款').length;
  const fullPaid=related.filter(n=>n.nodeStatus==='已全额回款').length;
  const onTimeNodes=related.filter(n=>n.nodeStatus==='正常实施中').length;

  // Use node-level totalExpected (matches sum of tier cards) instead of project-level aggregation
  const totalAmtWW=totalExpected;

  // Tier breakdown for dashboard

  // Use filtered nodes (year+perspective) for tier cards, consistent with summary bar
  const tierStats=['100万以上','50-100万','50万以下'].map(t=>{

    const s=computeTierStats(t,allNodes);

    return {tier:t,count:s.projectCount||0,amt:s.expectedAmountWan||0,rem:s.remainingAmountWan||0};

  });

  el.innerHTML=`<div style="padding:20px">

      <div id="ledgerSummaryBar" class="summary-bar" style="margin-bottom:16px">

        <div class="summary-item"><div class="label">项目总数</div><div class="value" style="color:var(--dark)">${allProjs.length}</div></div>

        <div class="summary-item"><div class="label">计划回款总金额(万)</div><div class="value" style="color:var(--blue)">${fmtWan(totalAmtWW)}</div></div>

        <div class="summary-item"><div class="label">已回款总金额(万)</div><div class="value" style="color:var(--green)">${fmtWan(actW)}</div></div>

        <div class="summary-item"><div class="label">待回款总金额(万)</div><div class="value" style="color:var(--red)">${fmtWan(remW)}</div></div>

        <div class="summary-item"><div class="label">完成率</div><div class="value" style="color:${totalRate>=0.8?'var(--green)':totalRate>=0.5?'var(--orange)':'var(--red)'}">${pct(totalRate)}</div></div>

      </div>

      <div class="ledger-status-row">

        <div class="ledger-status-card"><div class="label">加资源可提前</div><div class="value" style="color:var(--primary)">${canAdvance}</div></div>

        <div class="ledger-status-card"><div class="label">达到回款条件</div><div class="value" style="color:#F59E0B">${reachedCondition}</div></div>

        <div class="ledger-status-card"><div class="label">已提前回款</div><div class="value" style="color:#059669">${advEarly}</div></div>

        <div class="ledger-status-card"><div class="label">已全额回款</div><div class="value" style="color:#10B981">${fullPaid}</div></div>

        <div class="ledger-status-card"><div class="label">延期</div><div class="value" style="color:var(--red)">${delayed}</div></div>

        <div class="ledger-status-card"><div class="label">正常实施中</div><div class="value" style="color:var(--blue)">${onTimeNodes}</div></div>

      </div>

      <div id="ledgerTierCards" style="display:flex;gap:12px;flex-wrap:wrap">

        ${tierStats.map(ts=>`<div style="flex:1;min-width:200px;padding:12px 16px;background:var(--gray-50);border-radius:var(--radius-sm);border-left:3px solid ${ts.tier==='100万以上'?'var(--red)':ts.tier==='50-100万'?'var(--orange)':'var(--green)'}">

          <div style="font-weight:700;font-size:13px;color:var(--dark);margin-bottom:6px">${ts.tier}</div>

          <div style="display:flex;gap:16px;font-size:12px"><span>项目数 <b style="color:var(--primary)">${ts.count}</b></span><span>计划回款金额 <b style="color:var(--blue)">${fmtYuan(ts.amt)}万</b></span><span>待回款金额 <b style="color:var(--red)">${fmtYuan(ts.rem)}万</b></span></div>

        </div>`).join('')}

      </div>

<div style="margin-top:16px">

      <div class="toolbar" style="margin-bottom:12px">

        <input type="text" id="ledgerSearch" placeholder="搜索项目编号/名称/经理..." oninput="filterLedger()" style="width:260px">

        <select id="ledgerTier" onchange="filterLedger()"><option value="">全部区间</option><option value="100万以上">100万以上</option><option value="50-100万">50-100万</option><option value="50万以下">50万以下</option></select>

        <select id="ledgerStatus" onchange="filterLedger()"><option value="">全部状态</option><option value="正常实施中">正常实施中</option><option value="已提前回款">已提前回款</option><option value="延期">延期</option><option value="加资源可提前">加资源可提前</option><option value="已全额回款">已全额回款</option><option value="达到回款条件">达到回款条件</option></select>

        <button class="btn btn-outline" style="margin-left:auto" onclick="exportLedgerExcel()">导出Excel</button>

      </div>

      <div id="ledgerTableClearBtn" style="margin-bottom:8px"></div><div class="table-wrap" style="max-height:calc(100vh - 420px)"><table class="data-table"><thead><tr><th>项目编号${CF.renderIcon('ledgerTable','projectId')}</th><th>项目名称${CF.renderIcon('ledgerTable','projectName')}</th><th>金额区间${CF.renderIcon('ledgerTable','tier')}</th><th>服务组${CF.renderIcon('ledgerTable','orgL4')}</th><th>项目经理${CF.renderIcon('ledgerTable','projectManager')}</th><th style="text-align:right">项目金额(元)${CF.renderIcon('ledgerTable','projectAmount')}</th><th style="text-align:right">计划回款金额(元)${CF.renderIcon('ledgerTable','expectedPayment')}</th><th style="text-align:right">已回款金额(元)${CF.renderIcon('ledgerTable','actualPayment')}</th><th style="text-align:right">待回款金额(元)${CF.renderIcon('ledgerTable','remainAmount')}</th><th>完成率${CF.renderIcon('ledgerTable','paymentRatio')}</th><th>状态${CF.renderIcon('ledgerTable','paymentStatus')}</th></tr></thead><tbody id="ledgerBody"></tbody></table></div>

      <div class="table-record-count" id="ledgerCount"></div>

  </div>`;

  filterLedger();

}



// Ledger drill-down columns - uses project overview display columns

let _ledgerDrillCols=null;

let _ledgerDrillTier='';

let _ledgerProjs=[];

function getLedgerDrillCols(tier){

  if(_ledgerDrillCols && _ledgerDrillTier===tier)return _ledgerDrillCols;

  _ledgerDrillTier=tier;

  const tierCols=(D.displayColumns||{})[tier]||[];

  if(!tierCols.length){

    _ledgerDrillCols=[

      {key:'projectId',label:'项目编号',visible:true},

      {key:'projectName',label:'项目名称',visible:true},

      {key:'tier',label:'金额区间',visible:true},

      {key:'orgL4',label:'服务组',visible:true},

      {key:'projectManager',label:'项目经理',visible:true},

      {key:'projectAmount',label:'项目金额',visible:true},

      {key:'expectedPayment',label:'计划回款',visible:true},

      {key:'actualPayment',label:'已回款金额(元)',visible:true},

      {key:'paymentRatio',label:'完成率',visible:true},

      {key:'paymentStatus',label:'状态',visible:true},

      {key:'canAdvance',label:'可提前',visible:true},

    ];

  }else{

    _ledgerDrillCols=tierCols.map(c=>({key:c.key,label:c.label,visible:c.visible!==false}));

  }

  return _ledgerDrillCols;

}

function selectAllLedgerCols(){

  const proj=_ledgerProjs[_expandedLedgerIdx];

  if(!proj)return;

  const c=getLedgerDrillCols(proj.tier);c.forEach(x=>{x.visible=true});_ledgerDrillCols=c;renderLedgerDrilldown();

}

function deselectAllLedgerCols(){

  const proj=_ledgerProjs[_expandedLedgerIdx];

  if(!proj)return;

  const c=getLedgerDrillCols(proj.tier);c.forEach(x=>{x.visible=false});_ledgerDrillCols=c;renderLedgerDrilldown();

}

let _expandedLedgerIdx=-1;

function toggleLedgerRow(idx){

  if(_expandedLedgerIdx===idx){_expandedLedgerIdx=-1;const existing=document.getElementById('ledgerExpandRow');if(existing)existing.remove();return}

  _expandedLedgerIdx=idx;

  // Remove previous expand

  const existing=document.getElementById('ledgerExpandRow');if(existing)existing.remove();

  // Reset drilldown columns when switching projects

  _ledgerDrillCols=null;

  // Find the clicked row and insert expand section after it

  const rows=document.querySelectorAll('#ledgerBody tr');

  let targetRow=null;

  rows.forEach(r=>{if(r.dataset.idx==String(idx))targetRow=r});

  if(!targetRow){renderLedgerDrilldown();return}

  const expandTr=document.createElement('tr');

  expandTr.id='ledgerExpandRow';

  const expandTd=document.createElement('td');

  expandTd.colSpan=11;

  expandTd.style.padding='0';

  expandTd.innerHTML='<div id="ledgerDrillContent"></div>';

  expandTr.appendChild(expandTd);

  targetRow.after(expandTr);

  renderLedgerDrilldown();

  // Highlight the clicked row

  rows.forEach(r=>r.style.background='');

  if(targetRow)targetRow.style.background='var(--primary-50)';

  setTimeout(()=>{expandTr.scrollIntoView({behavior:'smooth',block:'nearest'})},100);

}

function renderLedgerDrilldown(){

  const drillEl=document.getElementById('ledgerDrillContent');

  if(!drillEl||_expandedLedgerIdx<0)return;

  const proj=_ledgerProjs[_expandedLedgerIdx];

  if(!proj){drillEl.innerHTML='';return}

  const tier=proj.tier||'50万以下';

  const cols=getLedgerDrillCols(tier).filter(c=>c.visible);

  const allCols=getLedgerDrillCols(tier);

  // Get the first node of this project to access all fields

  const firstNode=D.rawNodes.find(n=>n.projectId===proj.projectId)||proj;

  // Build horizontal scrolling table with all visible columns

  let cells='';

  cols.forEach(c=>{

    cells+=fmtCell(firstNode,c.key);

  });

  // Node details

  const nodes=D.rawNodes.filter(n=>n.projectId===proj.projectId&&n.isPaymentRelated);

  let nodeHtml='';

  if(nodes.length>0){

    nodeHtml=`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light)"><div style="font-weight:700;color:var(--primary);margin-bottom:8px;font-size:13px">回款节点明细 (${nodes.length})</div><div class="table-wrap" style="max-height:240px"><table class="data-table"><thead><tr><th>节点</th><th>计划日期</th><th style="text-align:right">待回款(元)</th><th>实际比例</th><th>状态</th></tr></thead><tbody>`;

    nodes.forEach(n=>{

      const bc=n.nodeStatus==='延期'?'badge-red':n.nodeStatus==='加资源可提前'?'badge-purple':n.nodeStatus==='已提前回款'?'badge-green':n.nodeStatus==='已全额回款'?'badge-emerald':n.nodeStatus==='正常实施中'?'badge-blue':n.nodeStatus==='达到回款条件'?'badge-amber':'badge-gray';

      const remW=getNodeRemainingWan(n);

      nodeHtml+=`<tr><td>${n.milestone||n.stageName||n.nodeName||'-'}</td><td style="font-family:var(--font-mono)">${n.planDate||'-'}</td><td style="text-align:right;font-family:var(--font-mono);color:var(--blue)">${fmtYuan(remW)}<span class="ds-unit">元</span></td><td>${fmtRatio(n.actualPaymentRatio,'待上报')}</td><td><span class="badge ${bc}">${n.nodeStatus}</span></td></tr>`;

    });

    nodeHtml+=`</tbody></table></div></div>`;

  }

  drillEl.innerHTML=`

    <div style="padding:16px;background:var(--gray-50);border:2px solid var(--primary-50);border-radius:var(--radius-sm)">

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">

        <div><span style="font-size:14px;font-weight:700;color:var(--dark)">${proj.projectName||proj.projectId}</span><span style="margin-left:12px;font-size:12px;color:var(--gray)">项目编号: ${proj.projectId}</span></div>

        <span style="position:relative;display:inline-block"><button class="btn btn-outline" onclick="document.getElementById('ledgerCv').classList.toggle('show')" style="font-size:12px;padding:3px 10px">设置展示字段</button>

        <div class="col-vis-popup" id="ledgerCv"><div style="display:flex;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-light)"><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="selectAllLedgerCols()">全选</button><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="deselectAllLedgerCols()">取消全选</button></div>${allCols.map((c,i)=>`<label><input type="checkbox" ${c.visible?'checked':''} onchange="getLedgerDrillCols('${tier}')[${i}].visible=this.checked;renderLedgerDrilldown()"> ${c.label}</label>`).join('')}</div></span>

      </div>

      <div class="table-wrap" style="max-height:none;overflow-x:auto"><table class="data-table"><thead><tr>${cols.map(c=>'<th class="'+_colClass(c.key)+'">'+c.label+CF.renderIcon('searchTable',c.key)+'</th>').join('')}</tr></thead><tbody><tr>${cells}</tr></tbody></table></div>

      ${nodeHtml}

    </div>`;

}

// Keep showLedgerDrilldown as alias for column visibility refresh

function showLedgerDrilldown(proj){

  renderLedgerDrilldown();

}



function filterLedger(){

  _expandedLedgerIdx=-1;

  const q=(document.getElementById('ledgerSearch')?.value||'').toLowerCase();

  const tf=document.getElementById('ledgerTier')?.value||'';

  const sf=document.getElementById('ledgerStatus')?.value||'';

  let projs=groupByProject(_filteredRawNodes());

  if(tf)projs=projs.filter(p=>p.nodes&&p.nodes.some(n=>n.tier===tf));

  if(sf)projs=projs.filter(p=>p.paymentStatus===sf);

  if(q)projs=projs.filter(p=>(p.projectId+p.projectName+p.projectManager+p.orgL4).toLowerCase().includes(q));
  projs=CF.filterData('ledgerTable',projs);
  const ledgerClearBtn=document.getElementById('ledgerTableClearBtn');if(ledgerClearBtn)ledgerClearBtn.innerHTML=CF.renderClearBtn('ledgerTable');
  // Update ledger dashboard with filtered data - use projs (already filtered by search/tier/status/column filter)
  // to ensure ledgerSummaryBar and ledgerTierCards are linked with column filter results
  var lExpW=projs.reduce(function(s,p){return s+(p.expectedPayment||0)},0);
  var lActW=projs.reduce(function(s,p){return s+(p.actualPayment||0)},0);
  var lRemW=lExpW-lActW;
  var lRate=lExpW>0?lActW/lExpW:0;
  var lSummaryEl=document.getElementById('ledgerSummaryBar');
  if(lSummaryEl)lSummaryEl.innerHTML='<div class="summary-item"><div class="label">项目总数</div><div class="value" style="color:var(--dark)">'+projs.length+'</div></div><div class="summary-item"><div class="label">计划回款总金额(万)</div><div class="value" style="color:var(--blue)">'+fmtWan(lExpW)+'</div></div><div class="summary-item"><div class="label">已回款总金额(万)</div><div class="value" style="color:var(--green)">'+fmtWan(lActW)+'</div></div><div class="summary-item"><div class="label">待回款总金额(万)</div><div class="value" style="color:var(--red)">'+fmtWan(lRemW)+'</div></div><div class="summary-item"><div class="label">完成率</div><div class="value" style="color:'+(lRate>=0.8?'var(--green)':lRate>=0.5?'var(--orange)':'var(--red)')+'">'+pct(lRate)+'</div></div>';

  // Dynamically update ledger tier cards based on filtered projs data (respects column filter)
  var lTierCardsEl=document.getElementById('ledgerTierCards');
  if(lTierCardsEl){
    var lTierStats=['100万以上','50-100万','50万以下'].map(function(t){
      var lTierProjs=projs.filter(function(p){return p.tier===t});
      var lCount=lTierProjs.length;
      var lExp=lTierProjs.reduce(function(s,p){return s+(p.expectedPayment||0)},0);
      var lAct=lTierProjs.reduce(function(s,p){return s+(p.actualPayment||0)},0);
      var lRem=lExp-lAct;
      return {tier:t,count:lCount,amt:lExp/10000,rem:lRem/10000};
    });
    lTierCardsEl.innerHTML=lTierStats.map(function(ts){
      var borderColor=ts.tier==='100万以上'?'var(--red)':ts.tier==='50-100万'?'var(--orange)':'var(--green)';
      return '<div style="flex:1;min-width:200px;padding:12px 16px;background:var(--gray-50);border-radius:var(--radius-sm);border-left:3px solid '+borderColor+'"><div style="font-weight:700;font-size:13px;color:var(--dark);margin-bottom:6px">'+ts.tier+'</div><div style="display:flex;gap:16px;font-size:12px"><span>项目数 <b style="color:var(--primary)">'+ts.count+'</b></span><span>计划回款金额 <b style="color:var(--blue)">'+fmtYuan(ts.amt)+'万</b></span><span>待回款金额 <b style="color:var(--red)">'+fmtYuan(ts.rem)+'万</b></span></div></div>';
    }).join('');
  // FIX: 联动更新ledger-status-row的6个状态看板
  (function(){
    var sRow=document.querySelector('.ledger-status-row');
    if(!sRow||!projs||!projs.length)return;
    var statuses=['加资源可提前','达到回款条件','已提前回款','已全额回款','延期','正常实施中'];
    var counts=[0,0,0,0,0,0];
    for(var i=0;i<projs.length;i++){
      var ps=projs[i].paymentStatus;
      for(var j=0;j<statuses.length;j++){
        if(ps===statuses[j]){counts[j]++;break;}
      }
    }
    var vals=sRow.querySelectorAll('.ledger-status-card .value');
    if(vals.length>=6){
      for(var j=0;j<6;j++){
        if(vals[j])vals[j].textContent=counts[j];
      }
    }
  })();
  }

  projs.sort((a,b)=>(b.projectAmount||0)-(a.projectAmount||0));

  _ledgerProjs=projs;

  const tb=document.getElementById('ledgerBody');

  const cnt=document.getElementById('ledgerCount');

  if(!tb)return;

  tb.innerHTML=projs.slice(0,500).map((p,idx)=>{

    const bc=p.paymentStatus==='延期'?'badge-red':p.paymentStatus==='加资源可提前'?'badge-purple':p.paymentStatus==='已提前回款'?'badge-green':p.paymentStatus==='已全额回款'?'badge-emerald':p.paymentStatus==='正常实施中'?'badge-blue':p.paymentStatus==='达到回款条件'?'badge-amber':'badge-gray';

    const tc=p.tier==='100万以上'?'badge-red':p.tier==='50-100万'?'badge-orange':'badge-green';

    const expW=(p.expectedPayment||0);

    const actW=(p.actualPayment||0);

    const remW=((p.expectedPayment||0)-(p.actualPayment||0));

    const rate=p.expectedPayment>0?p.actualPayment/p.expectedPayment:0;

    const rc=rate>=0.8?'var(--green)':rate>=0.5?'var(--orange)':'var(--red)';

    return `<tr style="cursor:pointer" data-idx="${idx}" onclick="toggleLedgerRow(${idx})"><td class="td-project-id">${p.projectId}</td><td class="td-project-name" title="${p.projectName||''}">${truncName(p.projectName||'')}</td><td><span class="badge ${tc}">${p.tier}</span></td><td>${p.orgL4||'-'}</td><td>${p.projectManager||'-'}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(p.projectAmount)}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(expW)}</td><td style="text-align:right;font-family:var(--font-mono);color:var(--blue)">${fmtYuan(actW)}</td><td style="text-align:right;font-family:var(--font-mono);color:${remW>0?'var(--red)':'var(--green)'}">${fmtYuan(remW)}</td><td style="text-align:right;color:${rc};font-weight:700">${pct(rate)}</td><td><span class="badge ${bc}">${p.paymentStatus}</span></td></tr>`;

  }).join('');

  if(cnt)cnt.textContent=`共 ${projs.length} 条记录`;

}
CF.register('ledgerTable',filterLedger,function(){return groupByProject(_filteredRawNodes())});




// Calendar page state
// Calendar page: exclude fully paid and advance-paid nodes (no pending amount)
function _calExcludePaid(nodes){return nodes.filter(n=>n.nodeStatus!=='已全额回款'&&n.nodeStatus!=='已提前回款')}

// Calendar page state - independent year logic, not affected by global year-dock
let _calPage={year:new Date().getFullYear(),month:new Date().getMonth(),selectedDate:'',filterOrgL3:'',filterOrgL4:'',filterPM:''};
var _calPageDateData={};

function initCalendarPage(){
  const el=document.getElementById('page-calendar');
  if(!el)return;
  var _frn=_filteredRawNodes();if(!_frn||!_frn.length){el.innerHTML='<div style="padding:40px;text-align:center;color:var(--gray)">暂无数据，请先同步数据</div>';return}
  // Extract filter options
  const orgL3Set=new Set(),orgL4Set=new Set(),pmSet=new Set();
  _frn.filter(n=>n.isPaymentRelated&&n.planDate).forEach(n=>{
    if(n.orgL3)orgL3Set.add(n.orgL3);
    if(n.orgL4)orgL4Set.add(n.orgL4);
    if(n.projectManager)pmSet.add(n.projectManager);
  });
  const orgL3Opts=[...orgL3Set].sort();
  const orgL4Opts=[...orgL4Set].sort();
  const pmOpts=[...pmSet].sort();
  el.innerHTML=`<div class="cal-page">
    <div id=\"calDashboard\" style=\"display:flex;gap:14px;margin-bottom:12px\"></div>
    <div class="cal-filter-bar">
      <div class="cal-filter-group">
        <button class="cal-nav-arrow" onclick="_calPage.year--;renderCalPage();renderCalDashboard()" style="font-weight:900"><</button>
        <span class="cal-filter-year" id="calYearLabel">${_calPage.year}年</span>
        <button class="cal-nav-arrow" onclick="_calPage.year++;renderCalPage();renderCalDashboard()" style="font-weight:900">></button>
      </div>
      <div class="cal-filter-group">
        <button class="cal-nav-arrow" onclick="_calPage.month--;if(_calPage.month<0){_calPage.month=11;_calPage.year--}renderCalPage();renderCalDashboard()" style="font-weight:900"><</button>
        <span class="cal-filter-month" id="calMonthLabel">${_calPage.month+1}月</span>
        <button class="cal-nav-arrow" onclick="_calPage.month++;if(_calPage.month>11){_calPage.month=0;_calPage.year++}renderCalPage()" style="font-weight:900">></button>
      </div>
      <select class="cal-filter-select" id="calFilterOrgL3" onchange="_calPage.filterOrgL3=this.value;renderCalPage();renderCalUpcoming();renderCalDashboard()">
        <option value="">PM L3-1部门</option>${orgL3Opts.map(o=>`<option value="${o}" ${_calPage.filterOrgL3===o?'selected':''}>${o}</option>`).join('')}
      </select>
      <select class="cal-filter-select" id="calFilterOrgL4" onchange="_calPage.filterOrgL4=this.value;renderCalPage();renderCalUpcoming();renderCalDashboard()">
        <option value="">项目经理L4部门</option>${orgL4Opts.map(o=>`<option value="${o}" ${_calPage.filterOrgL4===o?'selected':''}>${o}</option>`).join('')}
      </select>
      <select class="cal-filter-select" id="calFilterPM" onchange="_calPage.filterPM=this.value;renderCalPage();renderCalUpcoming();renderCalDashboard()">
        <option value="">项目经理</option>${pmOpts.map(o=>`<option value="${o}" ${_calPage.filterPM===o?'selected':''}>${o}</option>`).join('')}
      </select>
      <button class="btn btn-outline" style="font-size:12px;padding:5px 12px" onclick="clearCalFilters()">清除所有筛选</button>
      <button class="btn btn-outline" style="font-size:12px;padding:5px 12px;margin-left:auto" onclick="exportCalExcel()">导出Excel</button>
    </div>
    <div id="calPageBody"></div>
    <div style="margin-top:16px"><div style="font-size:15px;font-weight:800;color:var(--dark);margin-bottom:8px" id="calListTitle">当月回款节点</div><div id="calListBody"></div></div>
    <div id="calUpcoming"></div>
  </div>`;
  renderCalPage();
  renderCalUpcoming();
  renderCalDashboard();
}

function renderCalDashboard(){
  var el=document.getElementById('calDashboard');if(!el)return;
  var nodes=getFilteredNodes().filter(function(n){return n.isPaymentRelated&&n.planDate;});
  if(_calPage.filterOrgL3)nodes=nodes.filter(function(n){return n.orgL3===_calPage.filterOrgL3;});
  if(_calPage.filterOrgL4)nodes=nodes.filter(function(n){return n.orgL4===_calPage.filterOrgL4;});
  if(_calPage.filterPM)nodes=nodes.filter(function(n){return n.projectManager===_calPage.filterPM;});
  var now=new Date(),nowY=now.getFullYear(),nowM=now.getMonth();
  var mExp=0,mAct=0,mCnt=0,upCnt=0,delCnt=0;
  nodes.forEach(function(n){
    var pd=n.planDate;if(!pd||pd.length<10)return;
    var py=parseInt(pd.substring(0,4)),pm=parseInt(pd.substring(5,7))-1;
    var diff=Math.ceil((new Date(pd.substring(0,10))-now)/86400000);
    if(diff>=0&&diff<=7)upCnt++;
    if(n.nodeStatus==='延期')delCnt++;
    if(py===nowY&&pm===nowM){mCnt++;mExp+=(n.expectedPayment||0);mAct+=(n.actualPayment||0);}
  });
  el.innerHTML=
    '<div class=\"card\" style=\"flex:1;min-width:0\"><div class=\"card-body\" style=\"text-align:center;padding:14px 10px\"><div style=\"font-size:11px;color:#8C8C9E;margin-bottom:4px\">当月待回款(万)</div><div style=\"font-size:24px;font-weight:800;color:#EF4444\">'+fmtWan(mExp-mAct)+'</div></div></div>'+
    '<div class=\"card\" style=\"flex:1;min-width:0\"><div class=\"card-body\" style=\"text-align:center;padding:14px 10px\"><div style=\"font-size:11px;color:#8C8C9E;margin-bottom:4px\">当月已回款(万)</div><div style=\"font-size:24px;font-weight:800;color:#10B981\">'+fmtWan(mAct)+'</div></div></div>'+
    '<div class=\"card\" style=\"flex:1;min-width:0\"><div class=\"card-body\" style=\"text-align:center;padding:14px 10px\"><div style=\"font-size:11px;color:#8C8C9E;margin-bottom:4px\">7天内到期</div><div style=\"font-size:24px;font-weight:800;color:#F59E0B\">'+upCnt+'</div></div></div>'+
    '<div class=\"card\" style=\"flex:1;min-width:0\"><div class=\"card-body\" style=\"text-align:center;padding:14px 10px\"><div style=\"font-size:11px;color:#8C8C9E;margin-bottom:4px\">当月回款节点</div><div style=\"font-size:24px;font-weight:800;color:#3B82F6\">'+mCnt+'</div></div></div>'+
    '<div class=\"card\" style=\"flex:1;min-width:0\"><div class=\"card-body\" style=\"text-align:center;padding:14px 10px\"><div style=\"font-size:11px;color:#8C8C9E;margin-bottom:4px\">延期节点</div><div style=\"font-size:24px;font-weight:800;color:#EF4444\">'+delCnt+'</div></div></div>';
}

function renderCalPage(){

  const body=document.getElementById('calPageBody');

  if(!body)return;

  const y=_calPage.year, m=_calPage.month;

  // Update filter bar labels
  const yearLabel=document.getElementById('calYearLabel');
  const monthLabel=document.getElementById('calMonthLabel');
  if(yearLabel)yearLabel.textContent=y+'年';
  if(monthLabel)monthLabel.textContent=(m+1)+'月';

  // Second month

  let y2=y, m2=m+1;

  if(m2>11){m2=0;y2=y+1}

  // Build dual-month calendar

  const today=new Date();

  // Count nodes per date with status breakdown

  _calPageDateData={};

  var _calFilterNodes=_calExcludePaid(_filteredRawNodes().filter(n=>n.isPaymentRelated&&n.planDate));
  if(_calPage.filterOrgL3)_calFilterNodes=_calFilterNodes.filter(n=>n.orgL3===_calPage.filterOrgL3);
  if(_calPage.filterOrgL4)_calFilterNodes=_calFilterNodes.filter(n=>n.orgL4===_calPage.filterOrgL4);
  if(_calPage.filterPM)_calFilterNodes=_calFilterNodes.filter(n=>n.projectManager===_calPage.filterPM);

  _calFilterNodes.forEach(n=>{

    const d=n.planDate.slice(0,10);

    if(!_calPageDateData[d])_calPageDateData[d]={total:0,delayed:0,onTime:0,advance:0,canAdvance:0,reachedCondition:0,fullPaid:0,pending:0};

    _calPageDateData[d].total++;

    if(n.nodeStatus==='延期')_calPageDateData[d].delayed++;
    else if(n.nodeStatus==='正常实施中')_calPageDateData[d].onTime++;
    else if(n.nodeStatus==='已提前回款')_calPageDateData[d].advance++;
    else if(n.nodeStatus==='加资源可提前')_calPageDateData[d].canAdvance++;
    else if(n.nodeStatus==='达到回款条件')_calPageDateData[d].reachedCondition++;
    else if(n.nodeStatus==='已全额回款')_calPageDateData[d].fullPaid++;
    else _calPageDateData[d].pending++;

  });

  let calHtml='';

  // Dual month layout

  function buildMonthHtml(year,month){

    const dow=new Date(year,month,1).getDay();

    const startOff=dow===0?6:dow-1;

    const dim=new Date(year,month+1,0).getDate();

    const prevDim=new Date(year,month,0).getDate();

    let html=`<div class="cal-month-panel">`;

    html+=`<div style="text-align:center;font-size:14px;font-weight:800;color:var(--dark);margin-bottom:8px">${year}年${month+1}月</div>`;

    html+=`<div class="cal-view-weekdays">${['一','二','三','四','五','六','日'].map((d,i)=>`<span style="${i>=5?'color:var(--orange)':''}">${d}</span>`).join('')}</div>`;

    html+=`<div class="cal-view-days">`;

    for(let i=0;i<startOff;i++)html+=`<div class="cal-view-day other-month">${prevDim-startOff+i+1}</div>`;

    for(let d=1;d<=dim;d++){

      const ds=year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');

      const dayOfWeek=new Date(year,month,d).getDay();

      const isWeekend=dayOfWeek===0||dayOfWeek===6;

      const dd=_calPageDateData[ds]||{total:0,delayed:0,onTime:0,advance:0,pending:0};

      const cnt=dd.total;

      let cls='cal-view-day';

      if(year===today.getFullYear()&&month===today.getMonth()&&d===today.getDate())cls+=' today';

      if(isWeekend)cls+=' cal-weekend';

      if(cnt>0){

        cls+=' has-nodes';

        const statusCount=(dd.delayed>0?1:0)+(dd.onTime>0?1:0)+(dd.advance>0?1:0)+(dd.canAdvance>0?1:0)+(dd.reachedCondition>0?1:0)+(dd.fullPaid>0?1:0)+(dd.pending>0?1:0);
        const hasMixed=statusCount>1;

        if(hasMixed)cls+=' cal-status-mixed';
        else if(dd.delayed>0)cls+=' cal-status-delayed';
        else if(dd.onTime>0)cls+=' cal-status-ontime';
        else if(dd.advance>0)cls+=' cal-status-advance';
        else if(dd.canAdvance>0)cls+=' cal-status-canadvance';
        else if(dd.reachedCondition>0)cls+=' cal-status-reached';
        else if(dd.fullPaid>0)cls+=' cal-status-fullpaid';
        else cls+=' cal-status-pending';

      }

      const dayNames=['日','一','二','三','四','五','六'];

      const dayName=dayNames[dayOfWeek];

      let tip='';

      if(cnt>0){

        tip=`<div style="font-weight:700;margin-bottom:6px;font-size:13px">${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}（周${dayName}）</div>`;

        tip+=`<div style="border-top:1px solid rgba(255,255,255,.15);margin:4px 0;padding-top:4px">`;

        if(dd.delayed>0)tip+=`<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#EF4444;display:inline-block"></span><span>延期</span><span style="font-weight:700;margin-left:auto">${dd.delayed}</span></div>`;

        if(dd.onTime>0)tip+=`<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#3B82F6;display:inline-block"></span><span>正常实施中</span><span style="font-weight:700;margin-left:auto">${dd.onTime}</span></div>`;

        if(dd.advance>0)tip+=`<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#10B981;display:inline-block"></span><span>已提前回款</span><span style="font-weight:700;margin-left:auto">${dd.advance}</span></div>`;

        if(dd.canAdvance>0)tip+=`<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#6366F1;display:inline-block"></span><span>加资源可提前</span><span style="font-weight:700;margin-left:auto">${dd.canAdvance}</span></div>`;

        if(dd.reachedCondition>0)tip+=`<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#F59E0B;display:inline-block"></span><span>达到回款条件</span><span style="font-weight:700;margin-left:auto">${dd.reachedCondition}</span></div>`;

        if(dd.fullPaid>0)tip+=`<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#059669;display:inline-block"></span><span>已全额回款</span><span style="font-weight:700;margin-left:auto">${dd.fullPaid}</span></div>`;

        if(dd.pending>0)tip+=`<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#94A3B8;display:inline-block"></span><span>待确定</span><span style="font-weight:700;margin-left:auto">${dd.pending}</span></div>`;

        tip+=`</div>`;

        tip+=`<div style="border-top:1px solid rgba(255,255,255,.15);margin-top:4px;padding-top:4px;font-size:11px;opacity:.8">合计 ${cnt} 个节点</div>`;

      }

      const selCls=_calPage.selectedDate===ds?' cal-selected':'';
      const tipData=cnt>0?`data-tip-date="${ds}"`:'';

      html+=`<div class="${cls}${selCls}" onclick="selectCalDay('${ds}')" ${tipData} onmouseenter="showCalTip(this,event)" onmouseleave="hideCalTip()">${d}${cnt>0?`<span class="cal-day-badge">${cnt}</span>`:''}</div>`;

    }

    const total=startOff+dim;const rem=total%7===0?0:7-total%7;

    for(let i=1;i<=rem;i++)html+=`<div class="cal-view-day other-month">${i}</div>`;

    html+=`</div></div>`;

    return html;

  }

  calHtml+=`<div style="display:flex;gap:16px">`;

  calHtml+=buildMonthHtml(y,m);

  calHtml+=buildMonthHtml(y2,m2);

  calHtml+=`</div>`;



  body.innerHTML=calHtml;

  renderCalList();

}

function selectCalDay(dateStr){

  if(_calPage.selectedDate===dateStr){_calPage.selectedDate=''}

  else{_calPage.selectedDate=dateStr}

  renderCalPage();

}

function renderCalList(){

  const listEl=document.getElementById('calListBody');

  const titleEl=document.getElementById('calListTitle');

  if(!listEl)return;

  const selDate=_calPage.selectedDate;

  const y=_calPage.year,m=_calPage.month;

  let y2=y,m2=m+1;if(m2>11){m2=0;y2=y+1}

  const monthPrefix1=y+'-'+String(m+1).padStart(2,'0');

  const monthPrefix2=y2+'-'+String(m2+1).padStart(2,'0');

  let nodes=_calExcludePaid(_filteredRawNodes().filter(n=>n.isPaymentRelated&&n.planDate));
  if(_calPage.filterOrgL3)nodes=nodes.filter(n=>n.orgL3===_calPage.filterOrgL3);
  if(_calPage.filterOrgL4)nodes=nodes.filter(n=>n.orgL4===_calPage.filterOrgL4);
  if(_calPage.filterPM)nodes=nodes.filter(n=>n.projectManager===_calPage.filterPM);

  if(selDate){

    nodes=nodes.filter(n=>n.planDate.startsWith(selDate));

    if(titleEl)titleEl.textContent=selDate+' 回款节点';

  }else{

    nodes=nodes.filter(n=>n.planDate.startsWith(monthPrefix1)||n.planDate.startsWith(monthPrefix2));

    if(titleEl)titleEl.textContent='当月回款节点';

  }

  nodes.sort((a,b)=>(a.planDate||'').localeCompare(b.planDate||''));

  if(!nodes.length){listEl.innerHTML='<div style="color:var(--gray);text-align:center;padding:20px">暂无回款节点</div>';return}

  // Group by status in priority order (已提前回款/已全额回款已由_calExcludePaid过滤，不会出现)
  const statusOrder=[
    {key:'加资源可提前',color:'#6366F1'},
    {key:'达到回款条件',color:'#F59E0B'},
    {key:'延期',color:'#EF4444'},
    {key:'正常实施中',color:'#3B82F6'},
    {key:'待确定',color:'#94A3B8'}
  ];
  let tbody='';
  statusOrder.forEach(sg=>{
    const gNodes=nodes.filter(n=>n.nodeStatus===sg.key);
    if(!gNodes.length)return;
    const subRem=gNodes.reduce((s,n)=>s+getNodeRemaining(n),0);
    tbody+=`<tr style="background:${sg.color}15"><td colspan="13" style="font-weight:700;padding:8px 12px;border-left:3px solid ${sg.color}"><span style="color:${sg.color};font-size:13px">${sg.key}</span> <span style="margin-left:8px;color:var(--dark);font-size:12px">${gNodes.length}个节点，待回款小计 ${fmtWan(subRem)}万</span></td></tr>`;
    gNodes.forEach(n=>{
      const ew=getNodeRemainingWan(n);
      const bc=n.nodeStatus==='延期'?'badge-red':n.nodeStatus==='加资源可提前'?'badge-purple':n.nodeStatus==='已提前回款'?'badge-green':n.nodeStatus==='已全额回款'?'badge-emerald':n.nodeStatus==='正常实施中'?'badge-blue':n.nodeStatus==='达到回款条件'?'badge-amber':'badge-gray';
      const tc=n.tier==='100万以上'?'badge-red':n.tier==='50-100万'?'badge-orange':'badge-green';
      const ratio=fmtRatio(n.actualPaymentRatio,'待上报');
      tbody+=`<tr style="cursor:pointer;transition:background .15s" onclick="navCalNodeByProject('${n.tier}','${n.projectId}')" onmouseenter="this.style.background='var(--primary-50)'" onmouseleave="this.style.background=''" title="点击查看该项目回款节点"><td class="td-project-id">${n.projectId}</td><td class="td-project-name" title="${n.projectName||''}">${truncName(n.projectName||'')}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(n.projectAmount)}</td><td style="text-align:right;font-family:var(--font-mono);color:var(--red)">${fmtYuan(ew)}</td><td><span class="badge ${tc}">${n.tier}</span></td><td>${n.orgL4||'-'}</td><td>${n.projectManager||'-'}</td><td><span class="badge ${bc}">${n.nodeStatus}</span></td><td>${n.milestone||n.stageName||'-'}</td><td style="font-family:var(--font-mono)">${n.planDate||'-'}</td><td style="font-family:var(--font-mono)">${ratio}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(n.expectedPayment)}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(n.actualPayment)}</td></tr>`;
    });
  });

  listEl.innerHTML=`<div class="table-wrap" style="max-height:400px"><table class="data-table"><thead><tr><th>项目编号</th><th>项目名称</th><th style="text-align:right">项目金额(元)</th><th style="text-align:right">待回款金额(元)</th><th>金额区间</th><th>服务组</th><th>项目经理</th><th>节点状态</th><th>里程碑/阶段名称</th><th>计划回款时间</th><th>实际回款比例</th><th style="text-align:right">计划回款金额(元)</th><th style="text-align:right">已回款金额(元)</th></tr></thead><tbody>${tbody}</tbody></table></div><div class="table-record-count">共 ${nodes.length} 条记录</div>`;

}



function renderCalUpcoming(){
  const el=document.getElementById('calUpcoming');
  if(!el)return;
  const now=new Date();
  const d15=new Date(now.getTime()+15*864e5);
  const d30=new Date(now.getTime()+30*864e5);
  let allNodes=_calExcludePaid(_filteredRawNodes().filter(n=>n.isPaymentRelated&&n.planDate));
  if(_calPage.filterOrgL3)allNodes=allNodes.filter(n=>n.orgL3===_calPage.filterOrgL3);
  if(_calPage.filterOrgL4)allNodes=allNodes.filter(n=>n.orgL4===_calPage.filterOrgL4);
  if(_calPage.filterPM)allNodes=allNodes.filter(n=>n.projectManager===_calPage.filterPM);
  const up15=allNodes.filter(n=>{
    const ar=pctToNum(n.actualPaymentRatio);if(ar!==null&&ar>=1)return false
    try{const d=new Date(n.planDate);return d>=now&&d<=d15}catch{return false}
  }).sort((a,b)=>(a.planDate||'').localeCompare(b.planDate||''));
  const up30=allNodes.filter(n=>{
    const ar=pctToNum(n.actualPaymentRatio);if(ar!==null&&ar>=1)return false
    try{const d=new Date(n.planDate);return d>now&&d<=d30}catch{return false}
  }).sort((a,b)=>(a.planDate||'').localeCompare(b.planDate||''));
  function buildUpcomingTable(nodes,title,color,borderColor,maxShow){
    const thead='<thead><tr><th>项目编号</th><th>项目名称</th><th style="text-align:right">项目金额(元)</th><th style="text-align:right">待回款金额(元)</th><th>金额区间</th><th>服务组</th><th>项目经理</th><th>节点状态</th><th>里程碑/阶段名称</th><th>计划回款时间</th><th>实际回款比例</th><th style="text-align:right">计划回款金额(元)</th><th style="text-align:right">已回款金额(元)</th></tr></thead>';
    if(!nodes.length)return `<div class="cal-upcoming-panel" style="border-color:${borderColor}"><div class="cal-upcoming-header" style="background:${color}">${title}</div><div style="padding:16px;color:var(--gray);text-align:center">暂无到期回款节点</div></div>`;
    const tbody=nodes.slice(0,maxShow).map(n=>{
      const ew=getNodeRemainingWan(n);
      const bc=n.nodeStatus==='延期'?'badge-red':n.nodeStatus==='加资源可提前'?'badge-purple':n.nodeStatus==='已提前回款'?'badge-green':n.nodeStatus==='已全额回款'?'badge-emerald':n.nodeStatus==='正常实施中'?'badge-blue':n.nodeStatus==='达到回款条件'?'badge-amber':'badge-gray';
      const tc=n.tier==='100万以上'?'badge-red':n.tier==='50-100万'?'badge-orange':'badge-green';
      const ratio=fmtRatio(n.actualPaymentRatio,'待上报');
      return `<tr style="cursor:pointer;transition:background .15s" onclick="navCalNodeByProject('${n.tier}','${n.projectId}')" onmouseenter="this.style.background='var(--primary-50)'" onmouseleave="this.style.background=''" title="点击查看该项目回款节点"><td class="td-project-id">${n.projectId}</td><td class="td-project-name" title="${n.projectName||''}">${truncName(n.projectName||'')}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(n.projectAmount)}</td><td style="text-align:right;font-family:var(--font-mono);color:var(--red)">${fmtYuan(ew)}</td><td><span class="badge ${tc}">${n.tier}</span></td><td>${n.orgL4||'-'}</td><td>${n.projectManager||'-'}</td><td><span class="badge ${bc}">${n.nodeStatus}</span></td><td>${n.milestone||n.stageName||'-'}</td><td style="font-family:var(--font-mono)">${n.planDate||'-'}</td><td style="font-family:var(--font-mono)">${ratio}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(n.expectedPayment)}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(n.actualPayment)}</td></tr>`;
    }).join('');
    return `<div class="cal-upcoming-panel" style="border-color:${borderColor}"><div class="cal-upcoming-header" style="background:${color}">${title}</div><div class="table-wrap" style="max-height:400px"><table class="data-table">${thead}<tbody>${tbody}</tbody></table></div><div class="table-record-count">共 ${nodes.length} 条记录</div></div>`;
  }
  el.innerHTML=`<div style="margin-top:20px"><div style="font-size:16px;font-weight:800;color:var(--dark);margin-bottom:12px">即将到期回款节点</div><div class="cal-upcoming-row-layout">${buildUpcomingTable(up15,'15天内到期','var(--orange)','rgba(245,158,11,.3)',50)}${buildUpcomingTable(up30,'30天内到期','#3B82F6','rgba(59,130,246,.3)',100)}</div></div>`;
}

// === JS Tooltip for Calendar (ECharts-style dark tooltip) ===
function _ensureCalTip(){
  let tip=document.getElementById('calTipEl');
  if(!tip){
    tip=document.createElement('div');
    tip.id='calTipEl';
    tip.style.cssText='display:none;position:fixed;z-index:200;background:#0F172A;color:#F8FAFC;padding:10px 14px;border-radius:8px;font-size:12px;line-height:1.6;box-shadow:0 4px 20px rgba(0,0,0,.3);border:1px solid #334155;pointer-events:none;max-width:260px';
    document.body.appendChild(tip);
  }
  return tip;
}
function showCalTip(el,event){
  const ds=el.getAttribute('data-tip-date');
  if(!ds)return;
  const tip=_ensureCalTip();
  // Build tooltip HTML using dateData
  const dd=_calPageDateData&&_calPageDateData[ds];
  if(!dd||!dd.total){tip.style.display='none';return}
  const parts=ds.split('-');
  const yr=parts[0],mo=parseInt(parts[1],10),dy=parseInt(parts[2],10);
  const dayNames=['日','一','二','三','四','五','六'];
  const dow=new Date(parseInt(yr),mo-1,dy).getDay();
  let h='<div style="font-weight:700;margin-bottom:6px;font-size:13px">'+yr+'-'+String(mo).padStart(2,'0')+'-'+String(dy).padStart(2,'0')+'（周'+dayNames[dow]+'）</div>';
  h+='<div style="border-top:1px solid rgba(255,255,255,.15);margin:4px 0;padding-top:4px">';
  if(dd.delayed>0)h+='<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#EF4444;display:inline-block"></span><span>延期</span><span style="font-weight:700;margin-left:auto">'+dd.delayed+'</span></div>';
  if(dd.onTime>0)h+='<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#3B82F6;display:inline-block"></span><span>正常实施中</span><span style="font-weight:700;margin-left:auto">'+dd.onTime+'</span></div>';
  if(dd.advance>0)h+='<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#10B981;display:inline-block"></span><span>已提前回款</span><span style="font-weight:700;margin-left:auto">'+dd.advance+'</span></div>';
  if(dd.canAdvance>0)h+='<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#6366F1;display:inline-block"></span><span>加资源可提前</span><span style="font-weight:700;margin-left:auto">'+dd.canAdvance+'</span></div>';
  if(dd.reachedCondition>0)h+='<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#F59E0B;display:inline-block"></span><span>达到回款条件</span><span style="font-weight:700;margin-left:auto">'+dd.reachedCondition+'</span></div>';
  if(dd.fullPaid>0)h+='<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#059669;display:inline-block"></span><span>已全额回款</span><span style="font-weight:700;margin-left:auto">'+dd.fullPaid+'</span></div>';
  if(dd.pending>0)h+='<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:#94A3B8;display:inline-block"></span><span>待确定</span><span style="font-weight:700;margin-left:auto">'+dd.pending+'</span></div>';
  h+='</div>';
  h+='<div style="border-top:1px solid rgba(255,255,255,.15);margin-top:4px;padding-top:4px;font-size:11px;opacity:.8">合计 '+dd.total+' 个节点</div>';
  tip.innerHTML=h;
  tip.style.display='block';
  // Position: above the element
  const rect=el.getBoundingClientRect();
  let left=rect.left+rect.width/2-130;
  if(left<8)left=8;
  if(left+260>window.innerWidth)left=window.innerWidth-268;
  let top=rect.top-8;
  // Check if tooltip overflows top
  requestAnimationFrame(()=>{
    const th=tip.offsetHeight;
    if(rect.top-th-12<0){
      tip.style.top=(rect.bottom+8)+'px';
    }else{
      tip.style.top=(rect.top-th-8)+'px';
    }
    tip.style.left=left+'px';
  });
}
function hideCalTip(){
  const tip=document.getElementById('calTipEl');
  if(tip)tip.style.display='none';
}

function clearCalFilters(){
  _calPage.filterOrgL3='';
  _calPage.filterOrgL4='';
  _calPage.filterPM='';
  var el1=document.getElementById('calFilterOrgL3');
  var el2=document.getElementById('calFilterOrgL4');
  var el3=document.getElementById('calFilterPM');
  if(el1)el1.selectedIndex=0;
  if(el2)el2.selectedIndex=0;
  if(el3)el3.selectedIndex=0;
  renderCalPage();
  renderCalUpcoming();
  renderCalDashboard();
}

function showCalDayDetail(dateStr){

  var _nodes=_calExcludePaid(_filteredRawNodes().filter(n=>n.isPaymentRelated&&n.planDate&&n.planDate.startsWith(dateStr)));
  if(_calPage.filterOrgL3)_nodes=_nodes.filter(n=>n.orgL3===_calPage.filterOrgL3);
  if(_calPage.filterOrgL4)_nodes=_nodes.filter(n=>n.orgL4===_calPage.filterOrgL4);
  if(_calPage.filterPM)_nodes=_nodes.filter(n=>n.projectManager===_calPage.filterPM);
  if(!_nodes.length)return;

  const totalRem=_nodes.reduce((s,n)=>s+getNodeRemaining(n),0);
  
  // Group by status in tooltip order
  // 已提前回款/已全额回款已由_calExcludePaid过滤，不会出现
  const statusOrder=[
    {key:'延期',color:'#EF4444'},
    {key:'正常实施中',color:'#3B82F6'},
    {key:'加资源可提前',color:'#6366F1'},
    {key:'达到回款条件',color:'#F59E0B'},
    {key:'待确定',color:'#94A3B8'}
  ];
  let rows='';
  statusOrder.forEach(sg=>{
    const gNodes=_nodes.filter(n=>n.nodeStatus===sg.key);
    if(!gNodes.length)return;
    const subRem=gNodes.reduce((s,n)=>s+getNodeRemaining(n),0);
    rows+=`<tr style="background:${sg.color}15"><td colspan="7" style="font-weight:700;padding:8px 12px;border-left:3px solid ${sg.color}"><span style="color:${sg.color};font-size:13px">${sg.key}</span> <span style="margin-left:8px;color:var(--dark);font-size:12px">${gNodes.length}个节点，待回款小计 ${fmtWan(subRem)}万</span></td></tr>`;
    gNodes.forEach(n=>{
      const ew=getNodeRemainingWan(n);
      const bc=n.nodeStatus==='延期'?'badge-red':n.nodeStatus==='加资源可提前'?'badge-purple':n.nodeStatus==='已提前回款'?'badge-green':n.nodeStatus==='已全额回款'?'badge-emerald':n.nodeStatus==='正常实施中'?'badge-blue':n.nodeStatus==='达到回款条件'?'badge-amber':'badge-gray';
      const tc=n.tier==='100万以上'?'badge-red':n.tier==='50-100万'?'badge-orange':'badge-green';
      rows+=`<tr><td class="td-project-id">${n.projectId}</td><td class="td-project-name" title="${n.projectName||''}">${truncName(n.projectName||'')}</td><td><span class="badge ${tc}">${n.tier}</span></td><td>${n.milestone||n.stageName||'-'}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(ew)}</td><td>${fmtRatio(n.actualPaymentRatio,'待上报')}</td><td><span class="badge ${bc}">${n.nodeStatus}</span></td></tr>`;
    });
  });

  const el=document.getElementById('monthDetailModal');
  el.innerHTML=`<div class="modal-mask" onclick="this.parentElement.innerHTML=''"><div class="modal-box" onclick="event.stopPropagation()">
    <div class="modal-header"><span>${dateStr} 回款节点详情</span><span class="modal-close" onclick="this.closest('#monthDetailModal').innerHTML=''">&#10005;</span></div>
    <div class="modal-summary">共 ${_nodes.length} 个节点，待回款合计 ${fmtWan(totalRem)}万</div>
    <div class="modal-table-wrap"><table class="data-table"><thead><tr><th>项目编号</th><th>项目名称</th><th>金额区间</th><th>节点</th><th style="text-align:right">待回款(元)</th><th>实际比例</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div></div>`;

}




let _pmProjCols=null;
let _pmDelayCols=null;

function getPmProjCols(){

  if(_pmProjCols)return _pmProjCols;

  _pmProjCols=[{key:'projectId',label:'项目编号',visible:true},{key:'projectName',label:'项目名称',visible:true},{key:'tier',label:'金额区间',visible:true},{key:'orgL4',label:'服务组',visible:true},{key:'projectManager',label:'项目经理',visible:true},{key:'projectAmount',label:'项目金额',visible:true},{key:'paymentStatus',label:'回款状态',visible:true},{key:'paymentRatio',label:'完成率',visible:true}];

  return _pmProjCols;

}

function getPmDelayCols(){

  if(_pmDelayCols)return _pmDelayCols;

  _pmDelayCols=[{key:'projectId',label:'项目编号',visible:true},{key:'projectName',label:'项目名称',visible:true},{key:'tier',label:'金额区间',visible:true},{key:'milestone',label:'里程碑',visible:true},{key:'planDate',label:'计划日期',visible:true},{key:'expectedPayment',label:'计划回款',visible:true},{key:'actualPaymentRatio',label:'实际比例',visible:true},{key:'delayDays',label:'延期天数',visible:true}];

  return _pmDelayCols;

}

function togglePmProjCol(idx){const cols=getPmProjCols();cols[idx].visible=!cols[idx].visible;renderPmDrilldown()}

function togglePmDelayCol(idx){const cols=getPmDelayCols();cols[idx].visible=!cols[idx].visible;renderPmDrilldown()}

function selectAllPmProjCols(){const c=getPmProjCols();c.forEach(x=>x.visible=true);_pmProjCols=c;renderPmDrilldown()}

function deselectAllPmProjCols(){const c=getPmProjCols();c.forEach(x=>x.visible=false);_pmProjCols=c;renderPmDrilldown()}

function selectAllPmDelayCols(){const c=getPmDelayCols();c.forEach(x=>x.visible=true);_pmDelayCols=c;renderPmDrilldown()}

function deselectAllPmDelayCols(){const c=getPmDelayCols();c.forEach(x=>x.visible=false);_pmDelayCols=c;renderPmDrilldown()}



function initPmView(){

  const el=document.getElementById('page-pmview');

  if(!el)return;

  _expandedPM='';

  el.innerHTML=`<div style="padding:20px"><div class="card"><div class="card-header" style="color:var(--primary)">项目经理视图</div><div class="card-body">

    <div class="toolbar" style="margin-bottom:16px">

      <input type="text" id="pmSearch" placeholder="搜索项目经理..." oninput="filterPmView()" style="width:300px">

    </div>

    <div id="pmTableWrap"></div>

  </div></div></div>`;

  filterPmView();

}



function togglePMRow(pmName,event){
  if(_expandedPM===pmName){_expandedPM='';closePmPopup();filterPmView();return}
  _expandedPM=pmName;
  closePmPopup();
  var popup=document.createElement('div');
  popup.id='pmPopupOverlay';
  popup.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;z-index:999;background:rgba(0,0,0,0.3);';
  var panel=document.createElement('div');
  panel.id='pmPopupPanel';
  // Fullscreen modal panel
  panel.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;background:#fff;overflow-y:auto;animation:modalIn .2s ease;padding:20px 24px;';
  panel.innerHTML='<div id="pmDrilldown"></div>';
  popup.appendChild(panel);
  // Click overlay to close
  popup.addEventListener('click',function(e){
    if(e.target===popup){_expandedPM='';closePmPopup();filterPmView()}
  });
  document.body.appendChild(popup);
  renderPmDrilldown();
}

function closePmPopup(){
  const overlay=document.getElementById('pmPopupOverlay');
  if(overlay)overlay.remove();
}



function renderPmDrilldown(){

  const drillEl=document.getElementById('pmDrilldown');

  if(!drillEl||!_expandedPM)return;

  try{
  const pmName=_expandedPM;

  const pmNodes=_filteredRawNodes().filter(n=>(n.projectManager||'未指定')===pmName);

  const projs=groupByProject(pmNodes);

  const delayedNodes=pmNodes.filter(n=>n.isPaymentRelated&&n.nodeStatus==='延期');

  const projCols=getPmProjCols().filter(c=>c.visible);

  const delayCols=getPmDelayCols().filter(c=>c.visible);

  const allProjCols=getPmProjCols();

  const allDelayCols=getPmDelayCols();

  function fmtPmCell(p,key){
    if(key==='tier')return `<td><span class="badge ${p.tier==='100万以上'?'badge-red':p.tier==='50-100万'?'badge-orange':'badge-green'}">${p.tier}</span></td>`;
    if(key==='paymentStatus'){const bc=p.paymentStatus==='延期'?'badge-red':p.paymentStatus==='加资源可提前'?'badge-purple':p.paymentStatus==='已提前回款'?'badge-green':p.paymentStatus==='已全额回款'?'badge-emerald':p.paymentStatus==='正常实施中'?'badge-blue':p.paymentStatus==='达到回款条件'?'badge-amber':'badge-gray';return `<td><span class="badge ${bc}">${p.paymentStatus}</span></td>`}
    if(key==='paymentRatio')return `<td style="text-align:right;font-family:var(--font-mono);color:${p.paymentRatio>=0.8?'var(--green)':p.paymentRatio>=0.5?'var(--orange)':'var(--red)'};font-weight:700">${pct(p.paymentRatio)}</td>`;
    if(key==='projectAmount')return `<td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(p.projectAmount)}</td>`;
    if(key==='projectId'){const v=p[key];return v!=null?`<td class="td-project-id" title="${v}">${v}</td>`:'<td>-</td>'}
if(key==='projectName'){const v=p[key];return v!=null?`<td class="td-project-name" title="${v}">${truncName(v)}</td>`:'<td>-</td>'}
    const v=p[key];return v!=null?`<td>${v}</td>`:'<td>-</td>';
  }

  drillEl.innerHTML=`

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:18px;font-weight:800;color:var(--dark)">${pmName} - 项目经理详情</div>
      <span class="modal-close" onclick="_expandedPM='';closePmPopup();filterPmView()" style="font-size:24px;cursor:pointer;color:var(--gray);line-height:1;padding:4px 8px;border-radius:4px;transition:all .15s" onmouseover="this.style.background='var(--gray-100)';this.style.color='var(--dark)'" onmouseout="this.style.background='';this.style.color='var(--gray)'">&#10005;</span>
    </div>
    <div class="card" style="margin-top:0;border:2px solid var(--primary-50)"><div class="card-header" style="color:var(--primary)">

      <span>${pmName} - 负责项目信息</span>

      <span style="position:relative;display:inline-block;margin-left:auto"><button class="btn btn-outline" onclick="document.getElementById('pmProjCv').classList.toggle('show')">设置展示字段</button>

      <div class="col-vis-popup" id="pmProjCv">

        <div style="display:flex;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-light)">

          <button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="selectAllPmProjCols()">全选</button>

          <button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="deselectAllPmProjCols()">取消全选</button>

        </div>

        ${allProjCols.map((c,i)=>`<label><input type="checkbox" ${c.visible?'checked':''} onchange="togglePmProjCol(${i})"> ${c.label}</label>`).join('')}

      </div></span>

    </div><div class="card-body">

      <div class="table-wrap" style="max-height:360px"><table class="data-table"><thead><tr>${projCols.map(c=>`<th${c.key==='projectAmount'||c.key==='paymentRatio'?' style="text-align:right"':''}>${c.label}</th>`).join('')}</tr></thead><tbody>

      ${projs.slice(0,100).map(p=>`<tr>${projCols.map(c=>fmtPmCell(p,c.key)).join('')}</tr>`).join('')}

      </tbody></table></div>${projs.length>8?'<div style="text-align:center;color:var(--gray);font-size:12px;padding:4px 0">还有'+( projs.length-8)+'条，滚动查看 ↓</div>':''}<div class="table-record-count">共 ${projs.length} 个项目</div>

    </div></div>

    <div class="card" style="margin-top:12px;border:2px solid var(--red-50)"><div class="card-header" style="color:var(--red)">

      <span>${pmName} - 延期节点信息</span>

      <span style="position:relative;display:inline-block;margin-left:auto"><button class="btn btn-outline" onclick="document.getElementById('pmDelayCv').classList.toggle('show')">设置展示字段</button>

      <div class="col-vis-popup" id="pmDelayCv">

        <div style="display:flex;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-light)">

          <button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="selectAllPmDelayCols()">全选</button>

          <button class="btn btn-outline" style="font-size:11px;padding:2px 8px" onclick="deselectAllPmDelayCols()">取消全选</button>

        </div>

        ${allDelayCols.map((c,i)=>`<label><input type="checkbox" ${c.visible?'checked':''} onchange="togglePmDelayCol(${i})"> ${c.label}</label>`).join('')}

      </div></span>

    </div><div class="card-body">

      <div class="table-wrap" style="max-height:360px"><table class="data-table"><thead><tr>${delayCols.map(c=>`<th${c.key==='expectedPayment'||c.key==='actualPaymentRatio'||c.key==='delayDays'?' style="text-align:right"':''}>${c.label}</th>`).join('')}</tr></thead><tbody>

      ${delayedNodes.slice(0,100).map(n=>`<tr>${delayCols.map(c=>fmtCell(n,c.key)).join('')}</tr>`).join('')}

      </tbody></table></div>${delayedNodes.length>8?'<div style="text-align:center;color:var(--gray);font-size:12px;padding:4px 0">还有'+(delayedNodes.length-8)+'条，滚动查看 ↓</div>':''}<div class="table-record-count">共 ${delayedNodes.length} 个延期节点</div>

    </div></div>`;

  }catch(e){console.error('renderPmDrilldown error:',e);drillEl.innerHTML='<div style="padding:40px;color:var(--red);text-align:center">加载项目经理详情失败: '+e.message+'</div>'}
}



function filterPmView(){

  const q=(document.getElementById('pmSearch')?.value||'').toLowerCase();

  const pmMap={};

  D.rawNodes.forEach(n=>{

    const pm=n.projectManager||'未指定';

    if(!pm.toLowerCase().includes(q))return;

    if(!pmMap[pm])pmMap[pm]={name:pm,projects:new Set(),totalAmount:0,actualPayment:0,expectedPayment:0,delayedCount:0};

    pmMap[pm].projects.add(n.projectId);

    pmMap[pm].totalAmount+=(n.projectAmount||0);

    if(n.isPaymentRelated){

      pmMap[pm].actualPayment+=(n.actualPayment||0);

      pmMap[pm].expectedPayment+=(n.expectedPayment||0);

      if(n.nodeStatus==='延期')pmMap[pm].delayedCount++;

    }

  });

  const pms=Object.values(pmMap).map(p=>{const rate=p.expectedPayment>0?p.actualPayment/p.expectedPayment:0;return {...p,rate}}).sort((a,b)=>b.rate-a.rate);

  const wrap=document.getElementById('pmTableWrap');

  if(!wrap)return;

  wrap.innerHTML=`<div class="table-wrap" style="max-height:calc(100vh - 220px)"><table class="data-table"><thead><tr><th style="text-align:center;width:48px">排名</th><th>项目经理</th><th style="text-align:center">项目数</th><th style="text-align:right">负责金额(元)</th><th style="text-align:right">已回款金额(元)</th><th style="text-align:right">待回款金额(元)</th><th style="text-align:center">完成率</th><th style="text-align:center">延期节点</th></tr></thead><tbody>

  ${pms.map((p,i)=>{const rem=p.expectedPayment-p.actualPayment;const rc=p.rate>=0.8?'var(--green)':p.rate>=0.5?'var(--orange)':'var(--red)';const isExp=_expandedPM===p.name;return `<tr style="cursor:pointer;${isExp?'background:var(--primary-50)!important;font-weight:700':''}" onclick="togglePMRow('${p.name.replace(/'/g,"\\'")}',event)"><td style="text-align:center;font-size:16px">${i+1}</td><td style="font-weight:600">${p.name}</td><td style="text-align:center">${p.projects.size}</td><td style="text-align:right;font-family:var(--font-mono)">${fmtYuan(p.totalAmount)}</td><td style="text-align:right;font-family:var(--font-mono);color:var(--blue)">${fmtYuan(p.actualPayment)}</td><td style="text-align:right;font-family:var(--font-mono);color:var(--red)">${fmtYuan(rem)}</td><td style="text-align:center;color:${rc};font-weight:700">${pct(p.rate)}</td><td style="text-align:center;color:${p.delayedCount>0?'var(--red)':'var(--green)'};font-weight:700">${p.delayedCount}</td></tr>`}).join('')}

  </tbody></table></div><div class="table-record-count">共 ${pms.length} 位项目经理</div>`;

}



// Data quality drill-down

const _checkNames=['缺少项目金额','实际回款比例待上报','缺少项目经理','缺少服务组','回款比例>100%'];

function showDataDrill(checkIdx,tierIdx){

  const tiers=['100万以上','50-100万','50万以下'];

  const tier=tierIdx>=0?tiers[tierIdx]:null;

  const checkName=_checkNames[checkIdx]||'';

  let nodes=D.rawNodes;

  if(tier)nodes=nodes.filter(n=>n.tier===tier);

  let filtered=[];

  if(checkIdx===0)filtered=nodes.filter(n=>!n.projectAmount);

  else if(checkIdx===1)filtered=nodes.filter(n=>n.isPaymentRelated&&pctToNum(n.actualPaymentRatio)===null);

  else if(checkIdx===2)filtered=nodes.filter(n=>!n.projectManager);

  else if(checkIdx===3)filtered=nodes.filter(n=>!n.orgL4);

  else if(checkIdx===4)filtered=nodes.filter(n=>n.isPaymentRelated&&pctToNum(n.actualPaymentRatio)!==null&&pctToNum(n.actualPaymentRatio)>1);

  

  const el=document.getElementById('monthDetailModal');

  el.innerHTML=`<div class="modal-mask" onclick="this.parentElement.innerHTML=''"><div class="modal-box" onclick="event.stopPropagation()">

    <div class="modal-header"><span>${tier||'全部区间'} - ${checkName}</span><span class="modal-close" onclick="this.closest('#monthDetailModal').innerHTML=''">&#10005;</span></div>

    <div class="modal-summary">共 ${filtered.length} 条记录</div>

    <div class="modal-table-wrap"><table class="data-table"><thead><tr><th>项目编号</th><th>项目名称</th><th>金额区间</th><th>服务组</th><th>项目经理</th></tr></thead><tbody>

    ${filtered.slice(0,200).map(n=>`<tr><td class="td-project-id">${n.projectId}</td><td class="td-project-name" title="${n.projectName||''}">${truncName(n.projectName||'')}</td><td><span class="badge ${n.tier==='100万以上'?'badge-red':n.tier==='50-100万'?'badge-orange':'badge-green'}">${n.tier}</span></td><td>${n.orgL4||'-'}</td><td>${n.projectManager||'-'}</td></tr>`).join('')}

    </tbody></table></div>

  </div></div>`;

}



// === Data Missing Check (数据缺失检查) ===

/** Get all available field names from rawNodes with Chinese labels */
/* Hidden fields: non-original columns from preprocess_data.py, should not appear in data integrity checks */
var _hiddenFieldKeys=new Set(['source','planMonth','delayDays','nodeStatus']);

function getAllFieldNames(){
  var labelMap={
    projectId:'项目编号',projectName:'项目名称',tier:'金额区间',orgL4:'L4部门',orgL3:'L3部门',
    projectManager:'项目经理',projectType:'项目类型',projectAmount:'项目金额',
    isPaymentRelated:'是否关联回款',canAdvance:'是否可提前',
    milestone:'里程碑',nodeName:'节点名称',
    planDate:'计划完成时间',actualPaymentRatio:'实际回款比例',
    expectedPayment:'计划回款金额',actualPayment:'实际回款金额',
    nodeStatus:'节点状态',delayDays:'延期天数',planMonth:'计划月份',
    projectCompletion:'当前项目完成%',isMilestoneAchieved:'是否已达成里程碑',
    remarks:'备注',remarks2:'备注2',signUnit:'签约单位',
    requirement:'需求',blocker:'阻塞点',blockerOwner:'阻塞负责人',
    advanceDetail:'无法提前原因分类',advanceReason:'可提前原因',
    nextAction:'下一步动作',nextActionDate:'下一步动作完成时间',
    planPaymentDate:'计划终验/服务完成',serviceType:'服务类型',
    deliveryCenter:'交付中心',contractAmount:'合同金额'
  };
  var dc=D.displayColumns||{};
  Object.keys(dc).forEach(function(tier){
    dc[tier].forEach(function(c){if(c.label)labelMap[c.key]=c.label})
  });
  var keySet={};
  D.rawNodes.forEach(function(n){Object.keys(n).forEach(function(k){keySet[k]=1})});
  var fields=[];
  Object.keys(keySet).sort().forEach(function(k){
    if(k.startsWith('_'))return;
    /* Skip hidden/non-original computed fields */
    if(_hiddenFieldKeys.has(k))return;
    fields.push({key:k,label:labelMap[k]||k})
  });
  return fields;
}

/** Get field names for a specific tier from displayColumns + rawNodes */
function getTierFieldNames(tier){
  var labelMap={
    projectId:'项目编号',projectName:'项目名称',tier:'金额区间',orgL4:'L4部门',orgL3:'L3部门',
    projectManager:'项目经理',projectType:'项目类型',projectAmount:'项目金额',
    isPaymentRelated:'是否关联回款',canAdvance:'是否可提前',
    milestone:'里程碑',nodeName:'节点名称',
    planDate:'计划回款时间',actualPaymentRatio:'实际回款比例',
    expectedPayment:'计划回款金额',actualPayment:'实际回款金额',
    nodeStatus:'节点状态',delayDays:'延期天数',planMonth:'计划月份',
    projectCompletion:'当前项目完成%',isMilestoneAchieved:'是否已达成里程碑',
    remarks:'备注',remarks2:'备注2',signUnit:'签约单位',
    requirement:'需求',blocker:'阻塞点',blockerOwner:'阻塞负责人',
    advanceDetail:'无法提前原因分类',advanceReason:'可提前原因',
    nextAction:'下一步动作',nextActionDate:'下一步动作完成时间',
    planPaymentDate:'计划终验/服务完成',serviceType:'服务类型',
    deliveryCenter:'交付中心',contractAmount:'合同金额'
  };
  var dc=D.displayColumns||{};
  Object.keys(dc).forEach(function(t){
    dc[t].forEach(function(c){if(c.label)labelMap[c.key]=c.label})
  });
  var fields=[];
  var keySet={};
  if(tier){
    var tierCols=dc[tier]||[];
    tierCols.forEach(function(c){
      if(!keySet[c.key]&&!_hiddenFieldKeys.has(c.key)){
        keySet[c.key]=1;
        fields.push({key:c.key,label:c.label||labelMap[c.key]||c.key})
      }
    });
    D.rawNodes.forEach(function(n){
      if(n.tier===tier){
        Object.keys(n).forEach(function(k){
          if(!k.startsWith('_')&&!keySet[k]&&!_hiddenFieldKeys.has(k)){
            keySet[k]=1;
            fields.push({key:k,label:labelMap[k]||k})
          }
        })
      }
    });
  }else{
    D.rawNodes.forEach(function(n){
      Object.keys(n).forEach(function(k){
        if(!k.startsWith('_')&&!keySet[k]){
          keySet[k]=1;
          fields.push({key:k,label:labelMap[k]||k})
        }
      })
    });
  }
  return fields;
}

/** Truncate project name >55 Chinese chars, keep title for hover */
function truncName(s){
  if(!s)return '';
  var cn=s.replace(/[^\u4e00-\u9fff]/g,'').length;
  if(cn>55)return s.substring(0,55)+'...';
  return s;
}

/** Show modal for data management missing check - shows all tiers with common/differential grouping */
function showDataMgmtMissingCheckModal(){
  var tiers=['100万以上','50-100万','50万以下'];
  var tierFields={};
  tiers.forEach(function(t){tierFields[t]=getTierFieldNames(t)});
  var allKeysMap={};
  tiers.forEach(function(t){
    tierFields[t].forEach(function(f){allKeysMap[f.key]=f.label})
  });
  var tierKeySets=tiers.map(function(t){
    var s={};
    tierFields[t].forEach(function(f){s[f.key]=1});
    return s;
  });
  var allKeys=Object.keys(allKeysMap);
  var commonKeys=[];
  var diffKeys=[];
  allKeys.forEach(function(k){
    var inAll=tierKeySets.every(function(s){return s[k]});
    if(inAll)commonKeys.push(k);
    else diffKeys.push(k);
  });
  commonKeys.sort();
  diffKeys.sort();

  var el=document.getElementById('monthDetailModal');
  var commonCb='<table style="table-layout:fixed;width:100%;border-collapse:collapse"><colgroup><col style="width:33.33%"><col style="width:33.33%"><col style="width:33.33%"></colgroup><tbody>';
  commonKeys.forEach(function(k,i){
    var label=allKeysMap[k]||k;
    if(i%3===0)commonCb+='<tr>';
    commonCb+='<td style="padding:3px 0;vertical-align:middle;text-align:left"><label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">'+
      '<input type="checkbox" class="mc-field-cb" data-key="'+k+'"> '+
      '<span style="color:var(--dark);font-weight:500">'+label+'</span></label></td>';
    if(i%3===2||i===commonKeys.length-1)commonCb+='</tr>';
  });
  commonCb+='</tbody></table>';
  var diffCb='<table style="table-layout:fixed;width:100%;border-collapse:collapse"><colgroup><col style="width:33.33%"><col style="width:33.33%"><col style="width:33.33%"></colgroup><tbody>';
  diffKeys.forEach(function(k,i){
    var label=allKeysMap[k]||k;
    var inTiers=tiers.filter(function(t,i2){return tierKeySets[i2][k]}).join('\u3001');
    if(i%3===0)diffCb+='<tr>';
    diffCb+='<td style="padding:3px 0;vertical-align:middle;text-align:left"><label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">'+
      '<input type="checkbox" class="mc-field-cb" data-key="'+k+'"> '+
      '<span style="color:var(--dark);font-weight:500">'+label+'</span>'+
      '<span style="color:var(--orange);font-size:11px">('+inTiers+')</span></label></td>';
    if(i%3===2||i===diffKeys.length-1)diffCb+='</tr>';
  });
  diffCb+='</tbody></table>';

  el.innerHTML='<div class="modal-mask" onclick="this.parentElement.innerHTML=\'\'">'+
    '<div class="modal-box" onclick="event.stopPropagation()" style="max-width:780px">'+
    '<div class="modal-header"><span>数据缺失检查 - 全部区间</span>'+
    '<span class="modal-close" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">&#10005;</span></div>'+
    '<div style="padding:12px 16px;font-size:13px;color:var(--gray)">选择要检查缺失数据的字段，系统将统计字段值为空(null/undefined/空字符串)的记录数</div>'+
    '<div style="padding:0 16px 8px;display:flex;gap:8px;border-bottom:1px solid var(--border-light);margin-bottom:8px">'+
    '<button class="btn btn-outline" style="font-size:11px;padding:2px 10px" onclick="document.querySelectorAll(\'.mc-field-cb\').forEach(function(cb){cb.checked=true})">全选</button>'+
    '<button class="btn btn-outline" style="font-size:11px;padding:2px 10px" onclick="document.querySelectorAll(\'.mc-field-cb\').forEach(function(cb){cb.checked=false})">取消全选</button>'+
    '</div>'+
    (commonKeys.length>0?'<div style="padding:4px 16px 0;font-size:13px;font-weight:700;color:var(--dark-3);margin-bottom:4px">通用字段</div>':'')+
    '<div style="max-height:200px;overflow-y:auto;padding:0 16px;">'+commonCb+'</div>'+
    (diffKeys.length>0?'<div style="padding:8px 16px 0;font-size:13px;font-weight:700;color:var(--orange);margin-bottom:4px;border-top:1px solid var(--border-light);margin-top:8px">差异性字段</div>':'')+
    '<div style="max-height:200px;overflow-y:auto;padding:0 16px;">'+diffCb+'</div>'+
    '<div style="padding:12px 16px;display:flex;gap:8px;justify-content:flex-end">'+
    '<button class="btn btn-outline" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">取消</button>'+
    '<button class="btn btn-primary" onclick="runMissingCheck(null)">开始检查</button>'+
    '</div></div></div>';
}

/** Show modal for user to select fields to check for missing data - 数据质检版：仅展示当前层级列名，默认不全选 */
function showMissingCheckModal(tier){
  var fields=getTierFieldNames(tier);
  var tierLabel=tier||'全部区间';
  var el=document.getElementById('monthDetailModal');
  var cbHtml='<table style="table-layout:fixed;width:100%;border-collapse:collapse"><colgroup><col style="width:33.33%"><col style="width:33.33%"><col style="width:33.33%"></colgroup><tbody>';
  fields.forEach(function(f,i){
    if(i%3===0)cbHtml+='<tr>';
    cbHtml+='<td style="padding:3px 0;vertical-align:middle;text-align:left"><label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">'+
      '<input type="checkbox" class="mc-field-cb" data-key="'+f.key+'"> '+
      '<span style="color:var(--dark);font-weight:500">'+f.label+'</span></label></td>';
    if(i%3===2||i===fields.length-1)cbHtml+='</tr>';
  });
  cbHtml+='</tbody></table>';
  var tierArg=tier?"'"+tier+"'":'null';
  el.innerHTML='<div class="modal-mask" onclick="this.parentElement.innerHTML=\'\'">'+
    '<div class="modal-box" onclick="event.stopPropagation()" style="max-width:680px">'+
    '<div class="modal-header"><span>数据缺失检查 - '+tierLabel+'</span>'+
    '<span class="modal-close" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">&#10005;</span></div>'+
    '<div style="padding:12px 16px;font-size:13px;color:var(--gray)">选择要检查缺失情况的字段，系统将统计该字段值为空(null/undefined/空字符串)的记录数</div>'+
    '<div style="padding:0 16px 8px;display:flex;gap:8px;border-bottom:1px solid var(--border-light);margin-bottom:8px">'+
    '<button class="btn btn-outline" style="font-size:11px;padding:2px 10px" onclick="document.querySelectorAll(\'.mc-field-cb\').forEach(function(cb){cb.checked=true})">全选</button>'+
    '<button class="btn btn-outline" style="font-size:11px;padding:2px 10px" onclick="document.querySelectorAll(\'.mc-field-cb\').forEach(function(cb){cb.checked=false})">取消全选</button>'+
    '</div>'+
'<div style="max-height:320px;overflow-y:auto;padding:0 16px">'+cbHtml+'</div>'+
    '<div style="padding:12px 16px;display:flex;gap:8px;justify-content:flex-end">'+
    '<button class="btn btn-outline" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">取消</button>'+
    '<button class="btn btn-primary" onclick="runMissingCheck('+tierArg+')">开始检查</button>'+
    '</div></div></div>';
}

/** Execute missing data check and display results */
function runMissingCheck(tier){
  var fields=getTierFieldNames(tier);
  var selectedKeys=[];
  document.querySelectorAll('.mc-field-cb').forEach(function(cb){
    if(cb.checked)selectedKeys.push(cb.getAttribute('data-key'));
  });
  if(!selectedKeys.length){alert('请至少选择一个字段');return}
  var nodes=D.rawNodes;
  if(tier)nodes=nodes.filter(function(n){return n.tier===tier});
  var total=nodes.length;
  var tiers=['100万以上','50-100万','50万以下'];
  var results=selectedKeys.map(function(key){
    var missingCount=0;
    var byTier={};
    tiers.forEach(function(t){byTier[t]=0});
    var missingNodes=[];
    nodes.forEach(function(n){
      var v=n[key];
      var isEmpty=v===null||v===undefined||v==='';
      if(isEmpty){
        missingCount++;
        if(byTier[n.tier]!==undefined)byTier[n.tier]++;
        if(missingNodes.length<200)missingNodes.push(n);
      }
    });
    var label=(fields.find(function(f){return f.key===key})||{}).label||key;
    return {key:key,label:label,missingCount:missingCount,byTier:byTier,missingNodes:missingNodes};
  });
  results.sort(function(a,b){return b.missingCount-a.missingCount});
  var el=document.getElementById('monthDetailModal');
  var tierLabel=tier||'全部区间';
  var resultHtml=results.map(function(r){
    if(r.missingCount===0)return '';
    var pctVal=total>0?(r.missingCount/total*100).toFixed(1):'0';
    var barW=Math.min(Number(pctVal),100);
    var barColor=barW>50?'var(--red)':barW>20?'var(--orange)':'var(--blue)';
    var tierArg2=tier?"'"+tier+"'":"''";
    return '<tr style="cursor:pointer" onclick="showMissingDetail(\''+r.key+'\','+tierArg2+')">'+
      '<td style="font-weight:600">'+r.label+'</td>'+
      '<td style="font-family:var(--font-mono);font-weight:700;color:var(--red)">'+r.missingCount+'</td>'+
      '<td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:8px;background:var(--gray-100);border-radius:4px;overflow:hidden"><div style="width:'+barW+'%;height:100%;background:'+barColor+';border-radius:4px"></div></div><span style="font-size:11px;color:var(--gray);min-width:40px">'+pctVal+'%</span></div></td>'+
      tiers.map(function(t){return '<td style="text-align:center;font-family:var(--font-mono);color:'+(r.byTier[t]>0?'var(--red)':'var(--green)')+'">'+r.byTier[t]+'</td>'}).join('')+
      '</tr>';
  }).join('');
  var hasResult=resultHtml.length>0;
  el.innerHTML='<div class="modal-mask" onclick="this.parentElement.innerHTML=\'\'">'+
    '<div class="modal-box" onclick="event.stopPropagation()" style="max-width:780px">'+
    '<div class="modal-header"><span>数据缺失检查结果 - '+tierLabel+' (共'+total+'条记录)</span>'+
    '<span class="modal-close" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">&#10005;</span></div>'+
    (hasResult?
    '<div class="modal-table-wrap"><table class="data-table"><thead><tr>'+
    '<th>字段名</th><th>缺失数</th><th>缺失率</th>'+
    tiers.map(function(t){return '<th style="text-align:center">'+t+'</th>'}).join('')+
    '</tr></thead><tbody>'+resultHtml+'</tbody></table></div>'+
    '<div style="padding:8px 16px;font-size:12px;color:var(--gray)">点击行可查看该字段缺失的记录明细</div>'
    :'<div style="padding:40px;text-align:center;color:var(--green);font-size:16px">所选字段均无缺失数据</div>')+
    '</div></div>';
}

/** Show detail of missing records for a specific field */
function showMissingDetail(key,tier){
  var fields=getTierFieldNames(tier);
  var fieldLabel=(fields.find(function(f){return f.key===key})||{}).label||key;
  var nodes=D.rawNodes;
  if(tier)nodes=nodes.filter(function(n){return n.tier===tier});
  var missing=nodes.filter(function(n){var v=n[key];return v===null||v===undefined||v===''});
  var el=document.getElementById('monthDetailModal');
  el.innerHTML='<div class="modal-mask" onclick="this.parentElement.innerHTML=\'\'">'+
    '<div class="modal-box" onclick="event.stopPropagation()" style="max-width:780px">'+
    '<div class="modal-header"><span>缺失明细 - '+fieldLabel+' (共'+missing.length+'条)</span>'+
    '<span class="modal-close" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">&#10005;</span></div>'+
    '<div class="modal-table-wrap"><table class="data-table"><thead><tr>'+
    '<th>项目编号</th><th>项目名称</th><th>金额区间</th><th>服务组</th><th>项目经理</th>'+
    '</tr></thead><tbody>'+
    missing.slice(0,200).map(function(n){
      var tc=n.tier==='100万以上'?'badge-red':n.tier==='50-100万'?'badge-orange':'badge-green';
      return '<tr><td class="td-project-id">'+(n.projectId||'-')+'</td>'+
        '<td class="td-project-name" title="'+(n.projectName||'')+'">'+truncName(n.projectName||'-')+'</td>'+
        '<td><span class="badge '+tc+'">'+n.tier+'</span></td>'+
        '<td>'+(n.orgL4||'-')+'</td><td>'+(n.projectManager||'-')+'</td></tr>';
    }).join('')+
    '</tbody></table></div>'+
    (missing.length>200?'<div style="text-align:center;color:var(--gray);font-size:12px;padding:4px">仅显示前200条，共'+missing.length+'条</div>':'')+
    '</div></div>';
}

// === Excel Export for Integrity Page ===

function exportIntegrityExcel(){

  const inc=(D.summary[curTier]||{}).incompleteData||[];

  

  let filtered=inc;

  

  if(!filtered.length){alert('无数据可导出');return}

  try{

    const wb=XLSX.utils.book_new();

    const data=[['项目编号','项目名称','L4部门','项目经理','当前项目完成%','是否已达成里程碑']];

    filtered.forEach(p=>{

      data.push([p.projectId||'',p.projectName||'',p.orgL4||'',p.projectManager||'',p.projectCompletion||'缺失',p.isMilestoneAchieved||'缺失']);

    });

    const ws=XLSX.utils.aoa_to_sheet(data);

    ws['!cols']=[{wch:16},{wch:30},{wch:16},{wch:12},{wch:16},{wch:18}];

    XLSX.utils.book_append_sheet(wb,ws,'数据质检');

    const today=new Date();

    const dateStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');

    XLSX.writeFile(wb,`数据质检_${curTier}_${dateStr}.xlsx`);

  }catch(e){alert('导出失败: '+e.message);console.error('exportIntegrityExcel error:',e)}

}



// === Excel Export Utilities ===

/** Export data to Excel with given columns. cols=[{key,label}], data=array of objects */
function exportTableExcel(cols,data,fileName){
  if(!data||!data.length){alert('无数据可导出');return}
  try{
    var header=cols.map(function(c){return c.label||c.key});
    var rows=[header];
    data.forEach(function(row){
      rows.push(cols.map(function(c){
        var v=row[c.key];
        if(v===null||v===undefined||v==='')return '';
        // Format boolean
        if(v===true||v==='true')return '是';
        if(v===false||v==='false')return '否';
        return String(v);
      }));
    });
    var wb=XLSX.utils.book_new();
    var ws=XLSX.utils.aoa_to_sheet(rows);
    // Set column widths
    ws['!cols']=cols.map(function(c){return{wch:Math.max((c.label||c.key).length*2+4,12)}});
    var sheetName=fileName.replace(/[\\/:*?"<>|]/g,'').substring(0,31)||'Sheet1';
    XLSX.utils.book_append_sheet(wb,ws,sheetName);
    var today=new Date();
    var dateStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    XLSX.writeFile(wb,fileName+'_'+dateStr+'.xlsx');
  }catch(e){alert('导出失败: '+e.message);console.error('exportTableExcel error:',e)}
}

/** Export multiple sheets to one Excel file. sheets=[{name,data,cols}] */
function exportMultiSheetExcel(sheets,fileName){
  if(!sheets||!sheets.length){alert('无数据可导出');return}
  try{
    var wb=XLSX.utils.book_new();
    sheets.forEach(function(sh){
      if(!sh.data||!sh.data.length)return;
      var header=sh.cols.map(function(c){return c.label||c.key});
      var rows=[header];
      sh.data.forEach(function(row){
        rows.push(sh.cols.map(function(c){
          var v=row[c.key];
          if(v===null||v===undefined||v==='')return '';
          if(v===true||v==='true')return '是';
          if(v===false||v==='false')return '否';
          return String(v);
        }));
      });
      var ws=XLSX.utils.aoa_to_sheet(rows);
      ws['!cols']=sh.cols.map(function(c){return{wch:Math.max((c.label||c.key).length*2+4,12)}});
      var sheetName=(sh.name||'Sheet').replace(/[\\/:*?"<>|]/g,'').substring(0,31);
      XLSX.utils.book_append_sheet(wb,ws,sheetName);
    });
    var today=new Date();
    var dateStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    XLSX.writeFile(wb,fileName+'_'+dateStr+'.xlsx');
  }catch(e){alert('导出失败: '+e.message);console.error('exportMultiSheetExcel error:',e)}
}

/** Show modal to select which tables to export (multi-select with checkboxes) */
function showExportSelectModal(tableOptions,fileName){
  // tableOptions = [{name, cols, data}]
  var el=document.getElementById('monthDetailModal');
  var cbHtml=tableOptions.map(function(opt,i){
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer">'+
      '<input type="checkbox" class="export-sel-cb" data-idx="'+i+'" checked> '+
      '<span style="font-weight:600;color:var(--dark)">'+opt.name+'</span>'+
      '<span style="color:var(--gray);font-size:12px">('+(opt.data?opt.data.length:0)+'条记录)</span></label>';
  }).join('');
  el.innerHTML='<div class="modal-mask" onclick="this.parentElement.innerHTML=\'\'">'+
    '<div class="modal-box" onclick="event.stopPropagation()" style="max-width:480px">'+
    '<div class="modal-header"><span>选择导出表格</span>'+
    '<span class="modal-close" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">&#10005;</span></div>'+
    '<div style="padding:12px 16px;font-size:13px;color:var(--gray)">选择要导出的表格，多个表格将作为同一Excel文件的不同Sheet导出</div>'+
    '<div style="padding:0 16px 8px;display:flex;gap:8px;border-bottom:1px solid var(--border-light);margin-bottom:8px">'+
    '<button class="btn btn-outline" style="font-size:11px;padding:2px 10px" onclick="document.querySelectorAll(\'.export-sel-cb\').forEach(function(cb){cb.checked=true})">全选</button>'+
    '<button class="btn btn-outline" style="font-size:11px;padding:2px 10px" onclick="document.querySelectorAll(\'.export-sel-cb\').forEach(function(cb){cb.checked=false})">取消全选</button>'+
    '</div>'+
    '<div style="max-height:300px;overflow-y:auto;padding:0 16px">'+cbHtml+'</div>'+
    '<div style="padding:12px 16px;display:flex;gap:8px;justify-content:flex-end">'+
    '<button class="btn btn-outline" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">取消</button>'+
    '<button class="btn btn-primary" onclick="doExportSelect('+JSON.stringify(fileName).replace(/"/g,'"')+','+tableOptions.length+')">导出Excel</button>'+
    '</div></div></div>';
}

/** Execute export from select modal */
function doExportSelect(fileName,total){
  var selected=[];
  document.querySelectorAll('.export-sel-cb').forEach(function(cb){
    if(cb.checked)selected.push(parseInt(cb.getAttribute('data-idx')));
  });
  if(!selected.length){alert('请至少选择一个表格');return}
  // Retrieve stored options
  if(!window._exportOptions||!window._exportOptions.length)return;
  var sheets=[];
  selected.forEach(function(idx){
    var opt=window._exportOptions[idx];
    if(opt&&opt.data&&opt.data.length)sheets.push(opt);
  });
  if(!sheets.length){alert('选中的表格无数据');return}
  exportMultiSheetExcel(sheets,fileName);
  // Close modal
  var el=document.getElementById('monthDetailModal');
  if(el)el.innerHTML='';
}

/** Export ledger data to Excel */
function exportLedgerExcel(){
  var projs=_ledgerProjs;
  if(!projs||!projs.length){alert('无数据可导出');return}
  var cols=[
    {key:'projectId',label:'项目编号'},
    {key:'projectName',label:'项目名称'},
    {key:'tier',label:'金额区间'},
    {key:'orgL4',label:'服务组'},
    {key:'projectManager',label:'项目经理'},
    {key:'projectAmount',label:'项目金额(元)'},
    {key:'expectedPayment',label:'计划回款金额(元)'},
    {key:'actualPayment',label:'已回款金额(元)'},
    {key:'remainAmount',label:'待回款金额(元)'},
    {key:'paymentRatio',label:'完成率'},
    {key:'paymentStatus',label:'状态'}
  ];
  var data=projs.map(function(p){
    return {
      projectId:p.projectId||'',
      projectName:p.projectName||'',
      tier:p.tier||'',
      orgL4:p.orgL4||'',
      projectManager:p.projectManager||'',
      projectAmount:p.projectAmount||0,
      expectedPayment:p.expectedPayment||0,
      actualPayment:p.actualPayment||0,
      remainAmount:(p.expectedPayment||0)-(p.actualPayment||0),
      paymentRatio:p.expectedPayment>0?(p.actualPayment/p.expectedPayment*100).toFixed(1)+'%':'0%',
      paymentStatus:p.paymentStatus||''
    };
  });
  exportTableExcel(cols,data,'回款台账');
}

/** Export calendar page data to Excel (multi-select) */
function exportCalExcel(){
  var calCols=[
    {key:'projectId',label:'项目编号'},
    {key:'projectName',label:'项目名称'},
    {key:'projectAmount',label:'项目金额(元)'},
    {key:'remainingAmount',label:'待回款金额(元)'},
    {key:'tier',label:'金额区间'},
    {key:'orgL4',label:'服务组'},
    {key:'projectManager',label:'项目经理'},
    {key:'nodeStatus',label:'节点状态'},
    {key:'milestone',label:'里程碑/阶段名称'},
    {key:'planDate',label:'计划回款时间'},
    {key:'actualPaymentRatio',label:'实际回款比例'},
    {key:'expectedPayment',label:'计划回款金额(元)'},
    {key:'actualPayment',label:'已回款金额(元)'}
  ];
  // Build monthly nodes data
  var y=_calPage.year,m=_calPage.month;
  var y2=y,m2=m+1;if(m2>11){m2=0;y2=y+1}
  var mp1=y+'-'+String(m+1).padStart(2,'0');
  var mp2=y2+'-'+String(m2+1).padStart(2,'0');
  var selDate=_calPage.selectedDate;
  var monthNodes=_calExcludePaid(_filteredRawNodes().filter(function(n){return n.isPaymentRelated&&n.planDate}));
  if(_calPage.filterOrgL3)monthNodes=monthNodes.filter(function(n){return n.orgL3===_calPage.filterOrgL3});
  if(_calPage.filterOrgL4)monthNodes=monthNodes.filter(function(n){return n.orgL4===_calPage.filterOrgL4});
  if(_calPage.filterPM)monthNodes=monthNodes.filter(function(n){return n.projectManager===_calPage.filterPM});
  if(selDate){
    monthNodes=monthNodes.filter(function(n){return n.planDate.startsWith(selDate)});
  }else{
    monthNodes=monthNodes.filter(function(n){return n.planDate.startsWith(mp1)||n.planDate.startsWith(mp2)});
  }
  monthNodes.sort(function(a,b){return (a.planDate||'').localeCompare(b.planDate||'')});
  var monthData=monthNodes.map(function(n){
    return {
      projectId:n.projectId||'',projectName:n.projectName||'',
      projectAmount:n.projectAmount||0,remainingAmount:getNodeRemaining(n),
      tier:n.tier||'',orgL4:n.orgL4||'',projectManager:n.projectManager||'',
      nodeStatus:n.nodeStatus||'',milestone:n.milestone||n.stageName||'',
      planDate:n.planDate||'',actualPaymentRatio:n.actualPaymentRatio||'-',
      expectedPayment:n.expectedPayment||0,actualPayment:n.actualPayment||0
    };
  });
  // Build upcoming 15-day data
  var now=new Date();
  var d15=new Date(now.getTime()+15*864e5);
  var d30=new Date(now.getTime()+30*864e5);
  var allUpcoming=_calExcludePaid(_filteredRawNodes().filter(function(n){return n.isPaymentRelated&&n.planDate}));
  var up15=allUpcoming.filter(function(n){
    var ar=pctToNum(n.actualPaymentRatio);if(ar!==null&&ar>=1)return false
    try{var d=new Date(n.planDate);return d>=now&&d<=d15}catch(e){return false}
  }).sort(function(a,b){return (a.planDate||'').localeCompare(b.planDate||'')});
  var up30=allUpcoming.filter(function(n){
    var ar=pctToNum(n.actualPaymentRatio);if(ar!==null&&ar>=1)return false
    try{var d=new Date(n.planDate);return d>now&&d<=d30}catch(e){return false}
  }).sort(function(a,b){return (a.planDate||'').localeCompare(b.planDate||'')});
  function mapUpNode(n){
    var ratio=fmtRatio(n.actualPaymentRatio,'待上报');
    return {
      projectId:n.projectId||'',projectName:n.projectName||'',
      projectAmount:n.projectAmount||0,remainingAmount:getNodeRemaining(n),
      tier:n.tier||'',orgL4:n.orgL4||'',projectManager:n.projectManager||'',
      nodeStatus:n.nodeStatus||'',milestone:n.milestone||n.stageName||'',
      planDate:n.planDate||'',actualPaymentRatio:ratio,
      expectedPayment:n.expectedPayment||0,actualPayment:n.actualPayment||0
    };
  }
  var up15Data=up15.map(mapUpNode);
  var up30Data=up30.map(mapUpNode);
  var tableOptions=[
    {name:(selDate||'当月')+'回款节点',cols:calCols,data:monthData},
    {name:'15天内到期回款节点',cols:calCols,data:up15Data},
    {name:'30天内到期回款节点',cols:calCols,data:up30Data}
  ];
  window._exportOptions=tableOptions;
  showExportSelectModal(tableOptions,'回款日历');
}

/** Export plan (回款状态) page data to Excel (multi-select by status board) */
function exportPlanExcel(){
  var allNodes=tierNodes(curTier).filter(function(n){return n.isPaymentRelated});
  var cols=getVisibleCols(curTier,'plan');
  var visCols=cols.filter(function(c){return c.visible});
  var boards=[
    {label:'加资源可提前',filter:function(n){return n.nodeStatus==='加资源可提前'}},
    {label:'达到回款条件',filter:function(n){return n.nodeStatus==='达到回款条件'}},
    {label:'已提前回款',filter:function(n){return n.nodeStatus==='已提前回款'}},
    {label:'已全额回款',filter:function(n){return n.nodeStatus==='已全额回款'}},
    {label:'延期',filter:function(n){return n.nodeStatus==='延期'}},
    {label:'正常实施中',filter:function(n){return n.nodeStatus==='正常实施中'}}
  ];
  var tableOptions=boards.map(function(b){
    var bNodes=allNodes.filter(b.filter);
    return {
      name:b.label+' ('+curTier+')',
      cols:visCols,
      data:bNodes
    };
  }).filter(function(opt){return opt.data&&opt.data.length>0});
  if(!tableOptions.length){alert('无数据可导出');return}
  window._exportOptions=tableOptions;
  showExportSelectModal(tableOptions,'回款状态_'+curTier);
}

/** Export project overview data to Excel */
function exportProjExcel(){
  var cols=getVisibleCols(curTier,'projects');
  var visCols=cols.filter(function(c){return c.visible});
  var ns=D.rawNodes.filter(function(n){return n.tier===curTier});
  var q=(document.getElementById('pSearch')?.value||'').toLowerCase();
  if(q)ns=ns.filter(function(n){return (n.projectId+n.projectName+n.projectManager).toLowerCase().includes(q)});
  ns=CF.filterData('projTable',ns);
  if(!ns.length){alert('无数据可导出');return}
  exportTableExcel(visCols,ns,'项目总览_'+curTier);
}

/** Export payment nodes data to Excel */
function exportNodeExcel(){
  var cols=getVisibleCols(curTier,'nodes');
  var visCols=cols.filter(function(c){return c.visible});
  var ns=D.rawNodes.filter(function(n){return n.tier===curTier});
  if(_cal.pickStart&&_cal.pickEnd){
    ns=ns.filter(function(n){return n.planDate&&n.planDate>=_cal.pickStart&&n.planDate<=_cal.pickEnd});
  }
  var q=(document.getElementById('nSearch')?.value||'').toLowerCase();
  if(q)ns=ns.filter(function(n){return (n.projectId+n.projectName).toLowerCase().includes(q)});
  var sf=document.getElementById('nStatus')?.value||'';
  if(sf)ns=ns.filter(function(n){return n.nodeStatus===sf});
  ns=CF.filterData('nodeTable',ns);
  if(!ns.length){alert('无数据可导出');return}
  exportTableExcel(visCols,ns,'回款节点_'+curTier);
}

// === Init ===


/* ===== Sub-Panel Functions (二级面板) ===== */
/* 二级面板在 view-dock 内部展开，紧靠一级选项右侧，不再使用独立drawer */

/** Open sub-panel inside view-dock for L4 or PM selection */
function openSubPanel(type) {
  /* null/undefined guard */
  if (!type) return;

  /* Ensure dock is expanded and add sub-expanded class for CSS transition */
  var dock = document.getElementById('viewDock');
  if (dock) { dock.classList.add('expanded'); dock.classList.add('sub-expanded'); }

  if (type === 'l4') {
    /* Set header */
    var header = document.getElementById('viewDockSubHeader');
    var title = document.getElementById('viewDockSubTitle');
    if (title) title.textContent = '选择L4服务组';
    if (header) header.style.display = '';

    /* Hide search for L4 */
    var search = document.getElementById('viewDockSubSearch');
    if (search) search.style.display = 'none';

    /* Build L4 list */
    var body = document.getElementById('viewDockSubBody');
    if (!body) return;

    var l4Set = new Set();
    if (D.rawNodes && D.rawNodes.length) {
      D.rawNodes.forEach(function(n) { if (n.orgL4 && n.orgL4.trim()) l4Set.add(n.orgL4.trim()); });
    }
    var l4List = Array.from(l4Set).sort();

    var html = '';
    l4List.forEach(function(dept) {
      var isActive = _viewL4 === dept;
      html += '<div class="view-dock-sub-item' + (isActive ? ' active' : '') + '" onclick="event.stopPropagation();switchViewL4(\'' + dept.replace(/'/g, "\\'") + '\')">' + dept + '</div>';
    });
    body.innerHTML = html;

  } else if (type === 'pm') {
    /* Set header */
    var header = document.getElementById('viewDockSubHeader');
    var title = document.getElementById('viewDockSubTitle');
    if (title) title.textContent = '选择项目经理';
    if (header) header.style.display = '';

    /* Show search for PM */
    var search = document.getElementById('viewDockSubSearch');
    if (search) search.style.display = '';
    var input = document.getElementById('viewDockSubInput');
    if (input) { input.value = ''; input.placeholder = '搜索项目经理...'; }

    /* Build PM list */
    renderSubPMList();
  }
}

/** Close sub-panel inside view-dock */
function closeSubPanel() {
  /* Only clear the body content, do NOT destroy the sub-panel structure (header/search/body elements) */
  var body = document.getElementById('viewDockSubBody');
  if (body) body.innerHTML = '';
  var dock = document.getElementById('viewDock');
  if (dock) dock.classList.remove('sub-expanded');
}

/** Re-render the current sub-panel list with search filter applied */
function renderSubPanelList() {
  var q = (document.getElementById('viewDockSubInput')?.value || '').toLowerCase().trim();
  if (_viewMode === 'l4') {
    renderSubL4List(q);
  } else if (_viewMode === 'pm') {
    renderSubPMList(q);
  }
}

/** Render L4 sub-panel list (called by openSubPanel and renderSubPanelList) */
function renderSubL4List(q) {
  var body = document.getElementById('viewDockSubBody');
  if (!body) return;

  /* null/undefined guard */
  if (!D.rawNodes || !D.rawNodes.length) { body.innerHTML = ''; return; }

  var l4Set = new Set();
  D.rawNodes.forEach(function(n) { if (n.orgL4 && n.orgL4.trim()) l4Set.add(n.orgL4.trim()); });
  var l4List = Array.from(l4Set).sort();

  /* Apply search filter for L4 (optional future use) */
  if (q) {
    l4List = l4List.filter(function(dept) { return dept.toLowerCase().includes(q); });
  }

  var html = '';
  l4List.forEach(function(dept) {
    var isActive = _viewL4 === dept;
    html += '<div class="view-dock-sub-item' + (isActive ? ' active' : '') + '" onclick="event.stopPropagation();switchViewL4(\'' + dept.replace(/'/g, "\\'") + '\')">' + dept + '</div>';
  });

  if (l4List.length === 0 && q) {
    html = '<div style="font-size:11px;color:var(--gray,#64748B);text-align:center;padding:6px">无匹配结果</div>';
  }
  if (l4List.length === 0) {
    html = '<div style="font-size:11px;color:var(--gray,#64748B);text-align:center;padding:6px">暂无数据</div>';
  }

  body.innerHTML = html;
}

/** Render PM list in sub-panel filtered by search */
function renderSubPMList(q) {
  var body = document.getElementById('viewDockSubBody');
  if (!body) return;

  /* null/undefined guard */
  if (!D.rawNodes || !D.rawNodes.length) { body.innerHTML = ''; return; }

  var q = (document.getElementById('viewDockSubInput')?.value || '').toLowerCase().trim();

  var pmSet = new Set();
  D.rawNodes.forEach(function(n) { if (n.projectManager && n.projectManager.trim()) pmSet.add(n.projectManager.trim()); });
  var pmList = Array.from(pmSet).sort();

  if (q) {
    pmList = pmList.filter(function(name) { return name.toLowerCase().includes(q); });
  }
  pmList = pmList.slice(0, 50);

  var html = '';
  pmList.forEach(function(name) {
    var isActive = _viewPM === name;
    html += '<div class="view-dock-sub-item' + (isActive ? ' active' : '') + '" onclick="event.stopPropagation();switchViewPM(\'' + name.replace(/'/g, "\\'") + '\')">' + name + '</div>';
  });

  if (pmList.length === 0 && q) {
    html = '<div style="font-size:11px;color:var(--gray,#64748B);text-align:center;padding:6px">无匹配结果</div>';
  }
  if (pmList.length === 0) {
    html = '<div style="font-size:11px;color:var(--gray,#64748B);text-align:center;padding:6px">暂无数据</div>';
  }

  body.innerHTML = html;
}



function init(){

  Object.keys(localStorage).filter(k=>k.startsWith('colVis_')).forEach(k=>localStorage.removeItem(k));

  // Set header version - match sync status font and color

  const hv=document.getElementById('headerVersion');

  if(hv){hv.textContent='v'+APP_VERSION}

  // Restore sidebar collapsed state from localStorage
  const sb=document.getElementById('sidebar');
  const sbBtn=document.getElementById('sidebarToggle');
  if(sb&&localStorage.getItem('sidebar_collapsed')==='1'){sb.classList.add('collapsed');if(sbBtn)sbBtn.title='展开菜单'}

  // Sync naguan checkbox with persisted state
  var ns=document.getElementById('naguanSwitch');
  if(ns){ns.checked=_naguanOn;}
  var nst=document.getElementById('naguanStatus');
  if(nst)nst.textContent=_naguanOn?'已开启':'已关闭';

  // Inject ledger drill-down styles



  // Moved to end of file after V5.9 functions
  // initDash();initData();
  updateYearDockVisibility();
  updateViewDockVisibility();
  positionViewDock();

  // Click outside year dock panel to collapse it
  document.addEventListener('click',function(e){
    const dock=document.getElementById('yearDock');
    if(dock&&dock.classList.contains('expanded')&&!dock.contains(e.target)){
      dock.classList.remove('expanded');
    }
  });

  // Click outside view dock panel to collapse it and close sub-panel
  document.addEventListener('click',function(e){
    const dock=document.getElementById('viewDock');
    if(dock&&dock.classList.contains('expanded')&&!dock.contains(e.target)){
      dock.classList.remove('expanded');
      // Also close sub-panel when clicking outside
      closeSubPanel();
    }
  });

}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init)}else{init()}

// === Cell Tooltip (Hover to show full content) ===
(function(){
  var _tipEl=null,_tipTimer=null;
  function getTip(){if(!_tipEl){_tipEl=document.createElement('div');_tipEl.className='cell-tooltip';document.body.appendChild(_tipEl)}return _tipEl}
  function showTip(td){
    var text=td.getAttribute('data-cell-tooltip');
    if(!text)return;
    var tip=getTip();
    tip.textContent=text;
    tip.style.display='block';
    // Check if content is actually truncated
    var isOverflow=td.scrollWidth>td.clientWidth+2||td.scrollHeight>td.clientHeight+2;
    if(!isOverflow&&text.length<=String(td.textContent||'').trim().length+2){tip.style.display='none';return}
    var rect=td.getBoundingClientRect();
    // Smart positioning: try right side first, then left, then above, then below
    requestAnimationFrame(function(){
      var tw=tip.offsetWidth;
      var th=tip.offsetHeight;
      var vw=window.innerWidth;
      var vh=window.innerHeight;
      var left,top;
      // Priority 1: above (center-aligned), if enough space above
      var aboveTop=rect.top-th-4;
      var belowTop=rect.bottom+4;
      // Center horizontally relative to td
      var centerLeft=rect.left+rect.width/2-tw/2;
      // Clamp centerLeft to viewport
      if(centerLeft<4)centerLeft=4;
      if(centerLeft+tw>vw-4)centerLeft=vw-4-tw;
      // Choose vertical position: above if space, else below
      if(aboveTop>=4){
        top=aboveTop;
        left=centerLeft;
      }else if(belowTop+th<=vh-4){
        top=belowTop;
        left=centerLeft;
      }else{
        // Not enough space above or below - place at right side
        left=rect.right+4;
        top=rect.top;
        if(left+tw>vw-4){left=rect.left-tw-4;}
        if(top+th>vh-4){top=vh-4-th;}
        if(left<4)left=4;
        if(top<4)top=4;
      }
      tip.style.left=left+'px';
      tip.style.top=top+'px';
    });
  }
  function hideTip(){var tip=getTip();if(tip)tip.style.display='none'}
  document.addEventListener('mouseover',function(e){
    var td=e.target.closest&&e.target.closest('td[data-cell-tooltip]');
    if(!td)return;
    clearTimeout(_tipTimer);
    _tipTimer=setTimeout(function(){showTip(td)},300);
  });
  document.addEventListener('mouseout',function(e){
    var td=e.target.closest&&e.target.closest('td[data-cell-tooltip]');
    if(!td)return;
    clearTimeout(_tipTimer);hideTip();
  });
  // Mark truncated cells with has-overflow class after table renders
  var _markTimer=null;
  function markOverflow(){
    // 性能优化：页面切换期间跳过强制布局扫描，避免卡顿
    if(_pageSwitching) return;
    // 性能优化：只扫描当前可见页面的表格，避免扫描全页面DOM
    var activePage = document.querySelector('.page.active');
    if(!activePage) return;
    activePage.querySelectorAll('.data-table td[data-cell-tooltip]').forEach(function(td){
      var isO=td.scrollWidth>td.clientWidth+2||td.scrollHeight>td.clientHeight+2;
      if(isO)td.classList.add('has-overflow'); else td.classList.remove('has-overflow');
    });
  }
  // 暴露 markOverflow 到全局作用域，供导航函数在页面切换完成后调用
  window.markOverflow = markOverflow;
  // Initial mark after page load
  setTimeout(markOverflow,800);
  // Re-mark on DOM changes (table re-renders)
  // 性能优化：MutationObserver仅在有data-table相关变化时触发markOverflow，减少无效布局扫描
  new MutationObserver(function(mutations){
    clearTimeout(_markTimer);
    // 快速判断：仅在有data-table或大量节点增删时才触发
    var relevant=false;
    for(var i=0;i<mutations.length;i++){
      var m=mutations[i];
      // 新增节点包含data-table或大量新增
      if(m.addedNodes&&m.addedNodes.length>5){relevant=true;break}
      // 目标是data-table内部
      if(m.target&&m.target.closest&&m.target.closest('.data-table')){relevant=true;break}
      // 大量节点移除
      if(m.removedNodes&&m.removedNodes.length>5){relevant=true;break}
    }
    if(!relevant&&!_pageSwitching)return;
    _markTimer=setTimeout(markOverflow,600);
  }).observe(document.body,{childList:true,subtree:true});

// ===== V5.9 NEW: Treemap + China Map + 临期跟进 =====

// Treemap render
window.renderTreemapChart = function(){
  var dom=document.getElementById('treemapChartV2');
  if(!dom)return;
  var ch=echarts.getInstanceByDom(dom)||echarts.init(dom);
  if(_charts.indexOf(ch)<0) _charts.push(ch);
  var cls=D.dashboard.classification||[];
  if(!cls.length)return;
  var cls2=cls.filter(function(c){ return c.count>0; });
  var colors=['#6366F1','#10B981','#EF4444','#F59E0B','#FBBF24','#D1D5DB','#8B5CF6','#3B82F6','#EAB308'];
  var flatData=cls2.map(function(c,i){
    return {name:c.name,value:c.count,count:c.count,pct:c.pct,amountWan:c.amountWan,
      itemStyle:{color:colors[i]||'#6B7280'}};
  });
  ch.setOption({
    tooltip:{formatter:function(p){return '<b>'+p.name+'</b><br/>项目: <b>'+p.data.count+'个</b> ('+p.data.pct+'%)<br/>金额: <b>'+(p.data.amountWan||0).toFixed(0)+'万元</b><br/><span style=\"color:#6366F1;font-size:10px\">点击查看详情</span>';}},
    series:[{type:'treemap',roam:false,nodeClick:false,width:'96%',height:'94%',top:4,bottom:4,left:'2%',right:'2%',breadcrumb:{show:false},
      label:{show:true,fontSize:15,fontWeight:700,position:'inside',verticalAlign:'middle',align:'center',overflow:'truncate',ellipsis:'...',formatter:function(p){return p.name+'\n'+p.data.count+'个 '+p.data.pct+'%';}},
      itemStyle:{borderColor:'#fff',borderWidth:2,borderRadius:4},
      emphasis:{label:{fontSize:18,fontWeight:800},itemStyle:{shadowBlur:16,shadowColor:'rgba(0,0,0,.3)',shadowOffsetX:2,shadowOffsetY:4,borderWidth:3,borderColor:'#111827'},cursor:'pointer'},
      data:flatData,
      animation:false
    }]
  });
  ch.off('click');
  ch.on('click', function(params){
    if(params.name && params.name!=='项目总数'){
      window._drilldownToOverview({type:'classification', label:params.name});
    }
  });
}



// ============================================================
// China Map — service group color mapping, emphasis, ~ inset
// ============================================================

// Service group → province mapping (edit to change assignments)
var _svcProvMap = {
  '京津服务组':'北京市','河北服务组':'河北省','辽宁服务组':'辽宁省',
  '吉林服务组':'吉林省','上海一服务组':'上海市','浙江服务组':'浙江省',
  '广东二服务组':'广东省'
};
// 行业组不参与地图省份关联（小金融服务组、银行服务组、运营商服务组）
// Province → service group reverse lookup
var _provSvcMap = {};
Object.keys(_svcProvMap).forEach(function(k){ _provSvcMap[_svcProvMap[k]] = k; });
// 多省份归属同一服务组（京津服务组覆盖北京+天津）
_provSvcMap['天津市'] = '京津服务组';

// Service group color palette (distinct, professional)
var _svcColors = [
  '#5470C6','#91CC75','#FAC858','#EE6666','#73C0DE',
  '#3BA272','#FC8452','#9A60B4','#EA7CCC','#48C9B0'
];
var _svcColorMap = {};
Object.keys(_svcProvMap).forEach(function(k,i){ _svcColorMap[k] = _svcColors[i % _svcColors.length]; });
var _provColorMap = {};
Object.keys(_provSvcMap).forEach(function(prov){
  _provColorMap[prov] = _svcColorMap[_provSvcMap[prov]];
});

// Render the China map
window.renderChinaMapChart = function(){
  var dom=document.getElementById('chinaMapChartV2');
  if(!dom)return;
  var ch=echarts.getInstanceByDom(dom)||echarts.init(dom);
  if(_charts.indexOf(ch)<0) _charts.push(ch);

  // Build tooltip data from real service group stats
  var svc=D.dashboard.serviceGroups||[];
  var ttMap={};
  var provCount={};
  svc.forEach(function(g){
    var prov=_svcProvMap[g.orgL4];
    if(prov){ ttMap[prov]=g; provCount[prov]=g.count; }
  });
  // 天津市与北京市共享京津服务组数据
  if(provCount['北京市']){ provCount['天津市'] = provCount['北京市']; ttMap['天津市'] = ttMap['北京市']; }

  var hasGeo=echarts.getMap('china');
  if(hasGeo){ _doChinaRender(ch,ttMap,provCount,svc); }
  else{
    fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json').then(function(r){return r.json();}).then(function(geo){
      echarts.registerMap('china',geo);
      _doChinaRender(ch,ttMap,provCount,svc);
    });
  }
};

window._doChinaRender = function(ch,ttMap,provCount,svc){
  // Build regions array: every province gets a color
  var allProvinces = [
    '北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','吉林省','黑龙江省',
    '上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省',
    '河南省','湖北省','湖南省','广东省','广西壮族自治区','海南省',
    '重庆市','四川省','贵州省','云南省','西藏自治区',
    '陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区',
    '台湾省','香港特别行政区','澳门特别行政区','南海诸岛'
  ];
  var regions = [];
  allProvinces.forEach(function(name){
    if(name==='南海诸岛'){
      regions.push({name:name, itemStyle:{areaColor:'#A8C8E8', borderColor:'#7BA8CC', borderWidth:1}});
      return;
    }
    var color = _provColorMap[name];
    if(color && provCount[name]>0){
      regions.push({name:name, itemStyle:{areaColor:color, borderColor:'rgba(255,255,255,.3)', borderWidth:1}});
    }else if(color){
      regions.push({name:name, itemStyle:{areaColor:_lighten(color,0.6), borderColor:'rgba(255,255,255,.2)', borderWidth:.5}});
    }else{
      regions.push({name:name, itemStyle:{areaColor:'#D5D0C8', borderColor:'#C5C0B8', borderWidth:.5}});
    }
  });

  ch.setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'item',
      formatter:function(p){
        var g=ttMap[p.name];
        if(!g) return p.name;
        return '<b style=\"font-size:13px\">'+g.orgL4+'</b><br/>'+p.name+'<br/><b style=\"font-size:16px\">'+g.count+'</b> projects';
      }
    },
    geo:{
      map:'china', roam:false,
      aspectScale:1.15, zoom:1.25, center:[104.5,36],
      layoutCenter:['50%','50%'], layoutSize:'96%',
      label:{show:false},
      itemStyle:{areaColor:'#D5D0C8', borderColor:'#C5C0B8', borderWidth:.5},
      emphasis:{
        itemStyle:{shadowBlur:16, shadowColor:'rgba(0,0,0,.25)', shadowOffsetX:2, shadowOffsetY:4, borderWidth:2, borderColor:'#333'},
        label:{show:false}
      },
      regions:regions
    },
  });

  // Click province → drill down
  ch.off('click');
  ch.on('click', function(params){
    if(params.name && ttMap[params.name]){
      window._drilldownToOverview({type:'serviceGroup', label: ttMap[params.name].orgL4});
    }
  });

  // Sidebar rendered by _refreshDashTopCharts (single source of truth, no overwrite)
};

// Helper: lighten a hex color by mixing with white
function _lighten(hex, factor){
  var r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  r=Math.round(r+(255-r)*factor); g=Math.round(g+(255-g)*factor); b=Math.round(b+(255-b)*factor);
  return '#'+[r,g,b].map(function(v){return v.toString(16).padStart(2,'0')}).join('');
}

window.renderChinaSidebar = function(svc){
  var sb=document.getElementById('chinaSidebarV2');
  if(!sb)return;
  var sorted=svc.slice().sort(function(a,b){return b.count-a.count;});
  var industryGroups = {'小金融服务组':1,'运营商服务组':1,'银行服务组':1};
  var regional = sorted.filter(function(g){return !industryGroups[g.orgL4];});
  var indus = sorted.filter(function(g){return industryGroups[g.orgL4];});
  var provColors={'广东省':'#FDCB6E','湖北省':'#A29BFE','浙江省':'#00B894','河北省':'#FAB1A0','河南省':'#55EFC4','北京市':'#6C5CE7','上海市':'#FF7675','吉林省':'#74B9FF','四川省':'#E17055','辽宁省':'#0984E3'};
  var html='';
  function _fuRenderGroup(title,groups){
    if(!groups.length)return'';
    var h='<div style=\"font-size:10px;font-weight:600;color:#B0ADAA;padding:2px 0 2px\">'+title+'</div>';
    groups.forEach(function(g){
      var prov=svcProvMap2[g.orgL4]||'';
      var pc=provColors[prov]||'#999';
      h+='<div class=\"china-sb-row\" data-org='+JSON.stringify(g.orgL4)+' onclick=\"window._drilldownToOverviewSG(this)\" title=\"点击查看 '+g.orgL4+' 详情\" style=\"cursor:pointer\"><span style=\"width:10px;height:10px;border-radius:3px;flex-shrink:0;background:'+pc+'\"></span>'+
        '<span style=\"flex:1;font-size:12px;font-weight:600;color:#1A1A2E\">'+g.orgL4+'</span>'+
        '<span style=\"font-size:16px;font-weight:800;color:#1A1A2E\">'+g.count+'</span></div>';
    });
    return h;
  }
  html+=_fuRenderGroup('区域组',regional);
  html+=_fuRenderGroup('行业组',indus);
  sb.innerHTML=html;
}
var svcProvMap2={'广东二服务组':'广东省','河北服务组':'河北省','吉林服务组':'吉林省','京津服务组':'北京市','辽宁服务组':'辽宁省','上海一服务组':'上海市','浙江服务组':'浙江省'};

// Render the two top charts on dashboard
window.renderDashTopCharts = function(){
  var dashPage=document.getElementById('page-dashboard');
  if(!dashPage)return;
  // Charts already exist — just refresh data and re-render
  if(document.getElementById('treemapChartV2')){ window._refreshDashTopCharts(); return; }
  // Create the top charts row
  var row=document.createElement('div');
  row.className='two-col';
  row.id='dashTopChartsV2';
  row.style.marginBottom='16px';
  row.innerHTML='<div class=\"card\"><div class=\"card-header\" style=\"display:flex;justify-content:space-between;align-items:center\"><span style=\"font-size:14px;font-weight:600\">项目分类分布</span></div>'+
    '<div class=\"card-body\" style=\"padding-top:0\"><div style=\"font-size:13px;color:#8C8C8C;margin-bottom:6px\">项目总数 <b style=\"font-size:20px;font-weight:700;color:#1A1A2E\">'+(D.dashboard.classificationTotal||D.meta.totalProjects||0)+'</b> 个</div><div id=\"treemapChartV2\" style=\"height:400px\"></div></div></div>'+
    '<div class=\"card\" style=\"overflow:hidden\"><div class=\"card-header\" style=\"display:flex;justify-content:space-between;align-items:center\"><span style=\"font-size:14px;font-weight:600\">服务组重点项目分布</span></div>'+
    '<div style=\"display:flex;height:470px\"><div style=\"flex:1;min-width:0\"><div id=\"chinaMapChartV2\" style=\"width:100%;height:100%\"></div></div><div style=\"width:185px;flex-shrink:0;border-left:1px solid #F0EDE8;padding:10px 12px;overflow-y:auto\" id=\"chinaSidebarV2\"></div></div></div>';
  // Insert at the top of dash page, before dashSummary
  var summary=document.getElementById('dashSummaryCards');
  if(summary){dashPage.insertBefore(row,summary);}else{dashPage.insertBefore(row,dashPage.firstChild);}
  // 首次渲染：初始化 China Map Geo + 统一填充数据
  setTimeout(function(){ renderChinaMapChart(); window._refreshDashTopCharts(); },100);
}

// Refresh top charts when filters (year/view/naguan) change
window._refreshDashTopCharts = function(){
  var treemapDom=document.getElementById('treemapChartV2');
  var chinaDom=document.getElementById('chinaMapChartV2');
  if(!treemapDom && !chinaDom) return; // not yet created
  if(curPage!=='dashboard') return;

  // Filter overview projects directly (only apply naguan, not node-based filtering)
  var allProjects = (D.projectOverview && D.projectOverview.projects) ? D.projectOverview.projects : [];
  var projects = allProjects.filter(function(p){
    if(_naguanOn && D.naguanExclude && D.naguanExclude[p.projectId]) return false;
    // L4服务组视角 / PM视角过滤
    if(_viewMode==='l4'&&_viewL4&&p.项目经理L4部门!==_viewL4) return false;
    if(_viewMode==='pm'&&_viewPM&&p.项目经理!==_viewPM) return false;
    return true;
  });

  // -- Recompute classification (JS mirror of Python compute_classification) --
  var total = projects.length;
  var totalAmount = projects.reduce(function(s,p){return s+(p.projectAmount||0);},0);
  var agentProjs = projects.filter(function(p){return p.签约形式分类==='佳杰签约';});
  var nonAgent = projects.filter(function(p){return p.签约形式分类!=='佳杰签约';});
  var snapList = [{label:'已100%回款',val:'已100%回款'},{label:'BH项目',val:'BH项目'},{label:'退货项目',val:'退换货项目'},{label:'已关闭项目',val:'项目已关闭'},{label:'0元单项目',val:'0元订单项目'},{label:'框架协议',val:'框架合同'}];
  var catResults = [];
  var categorizedIds = {};
  // Agent first
  var agCount = agentProjs.length;
  var agAmt = agentProjs.reduce(function(s,p){return s+(p.projectAmount||0);},0);
  catResults.push({name:'代理商（佳杰、方正）',count:agCount,pct:total>0?Math.round(agCount/total*1000)/10:0,amountWan:Math.round(agAmt/100)});
  snapList.forEach(function(snap){
    var matched = nonAgent.filter(function(p){return p.合同验收回款时间节点截图===snap.val && !categorizedIds[p.projectId];});
    matched.forEach(function(p){categorizedIds[p.projectId]=true;});
    var amt = matched.reduce(function(s,p){return s+(p.projectAmount||0);},0);
    catResults.push({name:snap.label,count:matched.length,pct:total>0?Math.round(matched.length/total*1000)/10:0,amountWan:Math.round(amt/100)});
  });
  // 维保类
  var maint = nonAgent.filter(function(p){return p.是否维保类项目==='是' && !categorizedIds[p.projectId];});
  maint.forEach(function(p){categorizedIds[p.projectId]=true;});
  var mAmt = maint.reduce(function(s,p){return s+(p.projectAmount||0);},0);
  catResults.push({name:'维保类项目',count:maint.length,pct:total>0?Math.round(maint.length/total*1000)/10:0,amountWan:Math.round(mAmt/100)});
  // 重点关注
  var categorizedTotal = agCount + catResults.slice(1).reduce(function(s,c){return s+c.count;},0);
  var focusCount = total - categorizedTotal;
  var catAmts = catResults.slice(1).reduce(function(s,c){return s+c.amountWan*100;},0);
  var focusAmt = totalAmount - agAmt - catAmts;
  catResults.push({name:'重点关注的项目',count:Math.max(focusCount,0),pct:total>0?Math.round(Math.max(focusCount,0)/total*1000)/10:0,amountWan:Math.round(Math.max(focusAmt,0)/100)});

  // Update treemap count text
  var totalEl = document.querySelector('#dashTopChartsV2 .card-body div b');
  if(totalEl) totalEl.textContent = total;

  // 更新 treemap（首次渲染设置完整配置，后续仅更新数据）
  if(treemapDom){
    var ch = echarts.getInstanceByDom(treemapDom) || echarts.init(treemapDom);
    if(_charts.indexOf(ch)<0) _charts.push(ch);
    var colors=['#6366F1','#10B981','#EF4444','#F59E0B','#FBBF24','#D1D5DB','#8B5CF6','#3B82F6','#EAB308'];
    // 过滤掉项目数为0的分类（L4视角下部分分类可能无项目）
    var visibleCats = catResults.filter(function(c){ return c.count > 0; });
    var flatData = visibleCats.map(function(c,i){
      return {name:c.name,value:c.count,count:c.count,pct:c.pct,amountWan:c.amountWan,
        itemStyle:{color:colors[i]||'#6B7280'}};
    });
    var isNew = !ch.getOption() || !ch.getOption().series || ch.getOption().series.length===0;
    var opt = {
      tooltip:{formatter:function(p){return '<b>'+p.name+'</b><br/>项目: <b>'+p.data.count+'个</b> ('+p.data.pct+'%)<br/>金额: <b>'+(p.data.amountWan||0).toFixed(0)+'万元</b><br/><span style=\"color:#6366F1;font-size:10px\">点击查看详情</span>';}},
      series:[{type:'treemap',roam:false,nodeClick:false,width:'96%',height:'94%',top:4,bottom:4,left:'2%',right:'2%',breadcrumb:{show:false},
        label:{show:true,fontSize:15,fontWeight:700,position:'inside',verticalAlign:'middle',align:'center',overflow:'truncate',ellipsis:'...',formatter:function(p){return p.name+'\n'+p.data.count+'个 '+p.data.pct+'%';}},
        itemStyle:{borderColor:'#fff',borderWidth:2,borderRadius:4},
        emphasis:{label:{fontSize:18,fontWeight:800},itemStyle:{shadowBlur:16,shadowColor:'rgba(0,0,0,.3)',shadowOffsetX:2,shadowOffsetY:4,borderWidth:3,borderColor:'#111827'},cursor:'pointer'},
        data:flatData,
        animation:false
      }]
    };
    ch.setOption(opt, isNew);
    if(isNew){
      ch.off('click');
      ch.on('click', function(params){
        if(params.name && params.name!=='项目总数'){
          window._drilldownToOverview({type:'classification', label:params.name});
        }
      });
    }
  }

  // -- Recompute service groups --
  var svcExcluded = {};
  agentProjs.forEach(function(p){svcExcluded[p.projectId]=true;});
  snapList.forEach(function(snap){
    nonAgent.filter(function(p){return p.合同验收回款时间节点截图===snap.val;}).forEach(function(p){svcExcluded[p.projectId]=true;});
  });
  maint.forEach(function(p){svcExcluded[p.projectId]=true;});
  var focusProjs = projects.filter(function(p){return !svcExcluded[p.projectId];});
  var svcGroups = {};
  focusProjs.forEach(function(p){
    var org = p.项目经理L4部门 || '未分配';
    if(!svcGroups[org]) svcGroups[org] = {orgL4:org, count:0, amountWan:0, naguanCount:0};
    svcGroups[org].count++;
    svcGroups[org].amountWan += Math.round((p.projectAmount||0)/100);
  });
  var svcArr = Object.values(svcGroups).sort(function(a,b){return b.count-a.count;});

  // Update sidebar (always, independent of map load)
  renderChinaSidebar(svcArr);
  // Update China map regions (only if map is loaded)
  if(chinaDom){
    var ch2 = echarts.getInstanceByDom(chinaDom);
    if(!ch2) return;
    if(_charts.indexOf(ch2)<0) _charts.push(ch2);
    var chOpt = ch2.getOption();
    if(!chOpt || !chOpt.geo || !chOpt.geo[0] || !chOpt.geo[0].map) return;
    var refProvCount={};
    svcArr.forEach(function(g){var prov=_svcProvMap[g.orgL4];if(prov)refProvCount[prov]=g.count;});
    // 天津市与北京市共享京津服务组数据
    if(refProvCount['北京市']) refProvCount['天津市'] = refProvCount['北京市'];
    var refRegions=[{name:'南海诸岛',itemStyle:{areaColor:'#A8C8E8',borderColor:'#7BA8CC',borderWidth:1}}];
    Object.keys(_provColorMap).forEach(function(name){
      var c=refProvCount[name]||0;
      if(c>0) refRegions.push({name:name,itemStyle:{areaColor:_provColorMap[name],borderColor:'rgba(255,255,255,.3)',borderWidth:1}});
      else refRegions.push({name:name,itemStyle:{areaColor:_lighten(_provColorMap[name],0.6),borderColor:'rgba(255,255,255,.2)',borderWidth:.5}});
    });
    ch2.setOption({geo:{regions:refRegions}});
    // L4视角：限制点击仅作用于当前服务组的省份
    ch2.off('click');
    if(_viewMode==='l4'&&_viewL4){
      var l4prov=_svcProvMap[_viewL4];
      if(l4prov){
        ch2.on('click', function(params){
          if(params.name===l4prov){
            window._drilldownToOverview({type:'serviceGroup', label: _viewL4});
          }
        });
      }
    }else{
      ch2.on('click', function(params){
        var pname=params.name;
        if(pname&&_provSvcMap[pname]){
          window._drilldownToOverview({type:'serviceGroup', label: _provSvcMap[pname]});
        }
      });
    }
  }
};

// V5.9: 看板首页下钻到项目总览
window._overviewDrilldown = null;
window._drilldownToOverview = function(dd){
  // dd = {type:'classification'|'serviceGroup', label:'分类名或服务组名'}
  window._overviewDrilldown = dd;
  // Navigate to project overview (use last known tier or default)
  var tier = curTier || localStorage.getItem('curTier') || '100万以上';
  navTierItem('projects', tier);
};
window._drilldownToOverviewSG = function(el){
  var name = el.getAttribute('data-org');
  if(name) window._drilldownToOverview({type:'serviceGroup', label: name});
};

// V5.9: 项目总览表格（数据来源：项目验收日期、回款条件信息收集 Sheet）
// V5.9: 项目总览表格（使用 data-table 风格匹配现有样式）
window._overviewVisibleCols = null;
window._overviewSearchTerm = '';
// V5.9: 项目总览表格（复用 _colClass / _colGroupHtml / CF 系统）
window._overviewAllCols = null;
window._overviewData = null;
window.renderProjectOverviewTable = function(c, projects){
  var tier = curTier || '100万以上';
  var saved = localStorage.getItem('colVis_overview_' + tier);
  var allCols;
  if(saved){ try { allCols = JSON.parse(saved); } catch(e){} }
  if(!allCols || !allCols.length){
    allCols = (D.projectOverview && D.projectOverview.columns) ? JSON.parse(JSON.stringify(D.projectOverview.columns)) : [];
  }
  window._overviewAllCols = allCols;
  window._overviewData = projects;
  window._overviewLastColKey = null; // reset so thead/colgroup rebuilt on tier switch

  // Register CF
  if(!CF._refreshMap['overviewTable']){
    CF.register('overviewTable', function(){ window._filterOverview(); }, function(){ return window._overviewData || []; });
  }

  var visCols = allCols.filter(function(c){ return c.visible !== false; });
  var html = '';
  // Drill-down banner
  if(window._overviewDrilldown){
    html += '<div style=\"display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:8px;margin-bottom:12px\">'+
      '<span style=\"font-size:13px\">下钻筛选: <b style=\"color:#4338CA\">'+window._overviewDrilldown.label+'</b></span>'+
      '<button onclick=\"window._clearDrilldown()\" style=\"font-size:11px;padding:4px 12px;cursor:pointer;background:#4338CA;color:#fff;border:none;border-radius:4px\">✕ 关闭下钻</button></div>';
  }
  html += '<div id=\"overviewClearBtn\" style=\"margin-bottom:8px\">'+CF.renderClearBtn('overviewTable')+'</div>';
  html += '<div class=\"toolbar\">';
  html += '<input type=\"text\" id=\"ovSearch\" placeholder=\"搜索项目编号/名称/经理...\">';
  html += '<span style=\"position:relative;display:inline-block\"><button class=\"btn btn-outline\" onclick=\"toggleColVis(&quot;ovcv&quot;)\">设置展示字段</button><div class=\"col-vis-popup\" id=\"ovcv\">'+allCols.map(function(c,i){ return '<label><input type=\"checkbox\" '+(c.visible!==false?'checked':'')+' onchange=\"window._toggleOverviewCol('+i+')\"> '+c.label+'</label>'; }).join('')+'</div></span>';
  html += '<button class=\"btn btn-outline\" style=\"margin-left:auto\" onclick=\"window._exportOverviewExcel()\">导出Excel</button>';
  html += '</div>';
  html += '<div class=\"table-wrap\" style=\"max-height:calc(100vh - 260px)\"><table class=\"data-table\" id=\"overviewTable\">'+_colGroupHtml(visCols)+'<thead></thead><tbody></tbody></table></div>';
  html += '<div class=\"table-record-count\" id=\"overviewCount\"></div>';
  c.innerHTML = html;
  var si = document.getElementById('ovSearch');
  if(si) si.oninput = function(){ window._filterOverview(); };
  _filterOverview();

  // Clear drilldown helper
  window._clearDrilldown = function(){
    window._overviewDrilldown = null;
    nav('dashboard');
  };
};

_toggleOverviewCol = function(idx){
  var cols = window._overviewAllCols; if(!cols) return;
  cols[idx].visible = !cols[idx].visible;
  var tier = curTier || '100万以上';
  localStorage.setItem('colVis_overview_' + tier, JSON.stringify(cols));
  _filterOverview();
};

window._filterOverview = function(){
  var allCols = window._overviewAllCols || [];
  var visCols = allCols.filter(function(c){ return c.visible !== false; });
  var data = (window._overviewData || []).slice();
  var q = (document.getElementById('ovSearch')?.value || '').toLowerCase();

  // Search — match against ALL field values
  if(q){
    data = data.filter(function(p){
      var haystack = '';
      for(var k in p){ if(p.hasOwnProperty(k)) haystack += (p[k]||'') + ' '; }
      return haystack.toLowerCase().indexOf(q) >= 0;
    });
  }

  // Drill-down filter (from dashboard classification or service group)
  if(window._overviewDrilldown){
    var dd = window._overviewDrilldown;
    if(dd.type === 'classification'){
      var label = dd.label;
      var excludedSnapshots = {'已100%回款':1,'BH项目':1,'退换货项目':1,'项目已关闭':1,'0元订单项目':1,'框架合同':1};
      if(label === '代理商（佳杰、方正）'){
        data = data.filter(function(p){ return p.签约形式分类 === '佳杰签约'; });
      } else if(label === '维保类项目'){
        data = data.filter(function(p){ return p.是否维保类项目 === '是' && p.签约形式分类 !== '佳杰签约' && !excludedSnapshots[p.合同验收回款时间节点截图]; });
      } else if(label === '重点关注的项目'){
        data = data.filter(function(p){ return p.签约形式分类 !== '佳杰签约' && !excludedSnapshots[p.合同验收回款时间节点截图] && p.是否维保类项目 !== '是'; });
      } else if(excludedSnapshots[label]){
        data = data.filter(function(p){ return p.合同验收回款时间节点截图 === label && p.签约形式分类 !== '佳杰签约'; });
      }
    } else if(dd.type === 'serviceGroup'){
      data = data.filter(function(p){ return p.项目经理L4部门 === dd.label; });
    }
  }

  // CF filter
  data = CF.filterData('overviewTable', data);

  // Clear btn
  var cb = document.getElementById('overviewClearBtn');
  if(cb) cb.innerHTML = CF.renderClearBtn('overviewTable');

  // Only rebuild thead/colgroup when visible columns change (expensive)
  var colKey = visCols.map(function(c){return c.key;}).join(',');
  if(window._overviewLastColKey !== colKey){
    window._overviewLastColKey = colKey;
    var cg = document.querySelector('#overviewTable colgroup');
    if(cg) cg.outerHTML = _colGroupHtml(visCols);
    var thead = document.querySelector('#overviewTable thead');
    if(thead){
      thead.innerHTML = '<tr>'+visCols.map(function(c){ return '<th>'+c.label+CF.renderIcon('overviewTable', c.key)+'</th>'; }).join('')+'</tr>';
    }
  }

  // Tbody — chunked progressive rendering (100 rows per frame)
  var tbody = document.querySelector('#overviewTable tbody');
  if(tbody){
    var _data = data, _visCols = visCols, _limit = Math.min(_data.length, 500);
    tbody.innerHTML = '';
    var _chunk = 0, _chunkSize = 100;
    function _renderChunk(){
      var start = _chunk * _chunkSize;
      var end = Math.min(start + _chunkSize, _limit);
      if(start >= _limit) return;
      var frag = document.createDocumentFragment();
      for(var i = start; i < end; i++){
        var p = _data[i]; var tr = document.createElement('tr');
        _visCols.forEach(function(c){
          var key = c.key, val = p[key]; var cls = _colClass(key);
          var td = document.createElement('td'); td.className = cls;
          if(val === null || val === undefined || val === ''){ td.textContent = '-'; tr.appendChild(td); return; }
          if(key === '纳管' || key.indexOf('纳管')>=0){ td.textContent = (val===true||val==='是'||val==='true'?'是':'否'); tr.appendChild(td); return; }
          var s = String(val); var full = s;
          if(c.isImage && s){
            if(s.match(/^https?:\/\//) || s.match(/\.(png|jpg|jpeg|gif|bmp|webp)$/i)){
              td.innerHTML = '<a href=\"'+s+'\" target=\"_blank\" style=\"color:var(--primary)\">查看</a>';
            }else{
              var d2 = s.length > 26 ? s.substring(0, 26)+'....' : s;
              td.textContent = d2; td.setAttribute('data-cell-tooltip', full);
            }
            tr.appendChild(td); return;
          }
          if(key.indexOf('金额')>=0){
            var num = parseFloat(s);
            if(!isNaN(num)){ td.style.fontFamily = 'var(--font-mono)'; td.textContent = fmtYuan(num); tr.appendChild(td); return; }
          }
          var display = s.length > 26 ? s.substring(0, 26)+'....' : s;
          td.textContent = display; td.setAttribute('data-cell-tooltip', full);
          tr.appendChild(td);
        });
        frag.appendChild(tr);
      }
      tbody.appendChild(frag);
      _chunk++;
      if(_chunk * _chunkSize < _limit){
        requestAnimationFrame(_renderChunk);
      }
    }
    requestAnimationFrame(_renderChunk);
  }

  // Count
  var cnt = document.getElementById('overviewCount');
  if(cnt) cnt.textContent = '共 '+data.length+' 条记录';

  // --- Update summary bar with filtered payment stats ---
  var summaryEl = document.getElementById('tierSummary');
  if(summaryEl){
    var allNodes = (D && D.rawNodes) ? D.rawNodes : [];
    var fpids = new Set(); data.forEach(function(p){ fpids.add(p.projectId); });
    var fnodes = allNodes.filter(function(n){ return n.isPaymentRelated && fpids.has(n.projectId); });
    var fExpected = fnodes.reduce(function(s,n){ return s+(n.expectedPayment||0); },0);
    var fActual = fnodes.reduce(function(s,n){ return s+(n.actualPayment||0); },0);
    var fRemaining = fExpected - fActual;
    var fRate = fExpected>0?fActual/fExpected:0;
    var fAdv = fnodes.filter(function(n){ return n.nodeStatus==='加资源可提前'; }).length;
    var fReached = fnodes.filter(function(n){ return n.nodeStatus==='达到回款条件'; }).length;
    var fDelayed = fnodes.filter(function(n){ return n.nodeStatus==='延期'; }).length;
    summaryEl.innerHTML = '<div class=\"summary-item\"><div class=\"label\">项目总数</div><div class=\"value\" style=\"color:var(--dark)\">'+data.length+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">已回款总金额(万)</div><div class=\"value\" style=\"color:var(--green)\">'+fmtWan(fActual)+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">待回款总金额(万)</div><div class=\"value\" style=\"color:var(--red)\">'+fmtWan(fRemaining)+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">完成率</div><div class=\"value\" style=\"color:'+(fRate>=0.8?'var(--green)':fRate>=0.5?'var(--orange)':'var(--red)')+'\">'+pct(fRate)+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">加资源可提前</div><div class=\"value\" style=\"color:var(--primary)\">'+fAdv+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">达到回款条件</div><div class=\"value\" style=\"color:#F59E0B\">'+fReached+'</div></div>'+
      '<div class=\"summary-item\"><div class=\"label\">延期</div><div class=\"value\" style=\"color:var(--red)\">'+fDelayed+'</div></div>';
    summaryEl.style.display='';
  }

  // Rebuild popup
  var popup = document.getElementById('ovcv');
  if(popup){
    popup.innerHTML = allCols.map(function(c,i){ return '<label><input type=\"checkbox\" '+(c.visible!==false?'checked':'')+' onchange=\"window._toggleOverviewCol('+i+')\"> '+c.label+'</label>'; }).join('');
  }
};

// Export overview to Excel (XLSX)
_exportOverviewExcel = function(){
  var allCols = window._overviewAllCols || [];
  var visCols = allCols.filter(function(c){ return c.visible !== false; });
  var data = (window._overviewData || []).slice();
  var q = (document.getElementById('ovSearch')?.value || '').toLowerCase();
  if(q){ data = data.filter(function(p){ var h='';for(var k in p){if(p.hasOwnProperty(k))h+=(p[k]||'')+' ';} return h.toLowerCase().indexOf(q) >= 0; }); }
  data = CF.filterData('overviewTable', data);
  if(!data.length){ alert('无数据可导出'); return; }
  var rows = [visCols.map(function(c){ return c.label; })];
  data.forEach(function(p){ rows.push(visCols.map(function(c){ return String(p[c.key]||''); })); });
  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = visCols.map(function(){ return {wch: 18}; });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '项目总览');
  XLSX.writeFile(wb, '项目总览_'+(curTier||'全部')+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
};


// 临期跟进 (Signal Board) — 含展开面板 (Expand Panel)
// ============================================================

// Follow-up data persistence: localStorage key 'fu_data'
//   Format: { "projectId": { flw: true|false, st: "status", fb: "feedback" }, ... }
function _fuData(){try{return JSON.parse(localStorage.getItem('fu_data')||'{}')}catch(e){return{}}}
function _fuSave(d){localStorage.setItem('fu_data',JSON.stringify(d))}
function _fuGet(pid){var d=_fuData();return d[pid]||{flw:false,st:'',fb:''};}
function _fuSet(pid,obj){var d=_fuData();d[pid]=obj;_fuSave(d);}

window.initFollowup = function(){
  var page=document.getElementById('page-followup');
  if(!page)return;
  var nodes=getFilteredNodes().filter(function(n){return n.isPaymentRelated;});
  var today=new Date();var deptMap={};
  var deptProjNodes={};
  var fuData=_fuData();
  nodes.forEach(function(n){
    var dept=n.orgL4||'未分配';
    var pid=n.projectId||'';
    if(!deptMap[dept]){deptMap[dept]={name:dept,d30:0,d15:0,d7:0,delay:0,flw:0,total:0,d7flw:0,d15flw:0,d30flw:0,delayFlw:0};deptProjNodes[dept]={};}
    deptMap[dept].total++;
    deptProjNodes[dept][pid]=(deptProjNodes[dept][pid]||0)+1;
    var isFlw=!!(fuData[pid]&&fuData[pid].flw);
    if(n.nodeStatus==='延期'){deptMap[dept].delay++;if(isFlw){deptMap[dept].flw++;deptMap[dept].delayFlw++;}}
    if(!n.planDate)return;
    var ar2=pctToNum(n.actualPaymentRatio);if(ar2!==null&&ar2>=1)return;
    var d=new Date(n.planDate);
    if(d<today)return;
    var diff=Math.ceil((d-today)/86400000);
    if(diff<=7){deptMap[dept].d7++;if(isFlw){deptMap[dept].flw++;deptMap[dept].d7flw++;}}
    else if(diff<=15){deptMap[dept].d15++;if(isFlw){deptMap[dept].flw++;deptMap[dept].d15flw++;}}
    else if(diff<=30){deptMap[dept].d30++;if(isFlw){deptMap[dept].flw++;deptMap[dept].d30flw++;}}
  });

  var stats=Object.values(deptMap).sort(function(a,b){if(b.delay!==a.delay)return b.delay-a.delay;if(b.d7!==a.d7)return b.d7-a.d7;if(b.d15!==a.d15)return b.d15-a.d15;return b.d30-a.d30;});
  var totalPidsAll={};stats.forEach(function(d){totalPidsAll[d.name]=true;});
  var total=stats.reduce(function(s,d){return s+d.total;},0);
  var delayedTotal=stats.reduce(function(s,d){return s+d.delay;},0);
  var d30total=stats.reduce(function(s,d){return s+d.d30;},0);
  var urgent=stats.reduce(function(s,d){return s+d.d7;},0);
  var d15total=stats.reduce(function(s,d){return s+d.d15;},0);
  var totalFlw=stats.reduce(function(s,d){return s+d.flw;},0);

  var fy2=filterYear||'all';
  var curY=clockService.getCurrentYear();
  var yearLabel='全部';
  // cycleLabelMap: filterYear → UI显示标签
  var clMap={};
  clMap['all']='全部'; clMap[String(curY)]='本年度'; clMap[String(curY+1)]='下一年度';
  clMap['upto'+curY]='至本年度'; clMap['upto'+String(curY+1)]='至下一年度';
  var cyclePrefix=clMap[fy2]||fy2; // 未命中（如季度值）用原始值兜底
  // 季度值：取父年度标签，如 '2026-Q1' → '本年度'（季度看板不联动）
  if(cyclePrefix===fy2&&fy2.indexOf('-Q')>=0){
    var baseY=fy2.split('-Q')[0]; cyclePrefix=clMap[baseY]||baseY;
  }
  // upto+季度：如 'upto2026-Q1' → '至本年度'
  if(fy2.indexOf('upto')===0&&fy2.indexOf('-Q')>=0){
    var bu=fy2.substring(4).split('-Q')[0]; cyclePrefix=clMap['upto'+bu]||fy2;
  }
  // yearLabel 用于标题
  if(fy2.indexOf('upto')===0){ var u2=fy2.substring(4); yearLabel='当前周期至'+(u2.indexOf('-Q')>=0?u2.replace('-Q','年Q')+'季度':u2+'年'); }
  else if(fy2.indexOf('-Q')>=0){ yearLabel='当前周期至'+fy2.replace('-Q','年Q')+'季度'; }
  else if(fy2!=='all'){ yearLabel='当前周期'+fy2+'年'; }
  var qStats=[{name:cyclePrefix+'-Q1季度汇总',pids:new Set(),nodeCount:0,expected:0,actual:0},
              {name:cyclePrefix+'-Q2季度汇总',pids:new Set(),nodeCount:0,expected:0,actual:0},
              {name:cyclePrefix+'-Q3季度汇总',pids:new Set(),nodeCount:0,expected:0,actual:0},
              {name:cyclePrefix+'-Q4季度汇总',pids:new Set(),nodeCount:0,expected:0,actual:0}];
  nodes.forEach(function(n){
    if(!n.planDate||n.planDate.length<7)return;
    var pm=parseInt(n.planDate.substring(5,7));
    var qi=pm<=3?0:pm<=6?1:pm<=9?2:3;
    qStats[qi].nodeCount++;
    qStats[qi].pids.add(n.projectId);
    qStats[qi].expected+=(n.expectedPayment||0);
    qStats[qi].actual+=(n.actualPayment||0);
  });

  var html='';
  html+='<div class="card" style="margin-bottom:12px"><div class="card-header" id="fuQTitle">季度回款概览 ('+yearLabel+')</div><div class="card-body" style="padding:10px 16px"><div style="display:flex;gap:12px">';
  qStats.forEach(function(q){
    var cnt=q.pids.size;
    html+='<div style="flex:1;text-align:center;padding:10px 6px;background:#FAFBFC;border-radius:8px;border:1px solid #EBE7E2">'+
      '<div style="font-size:13px;font-weight:700;color:#1A1A2E;margin-bottom:4px">'+q.name+'</div>'+
      '<div style="font-size:10px;color:#8C8C9E">节点 / 项目</div><div style="font-size:20px;font-weight:800;color:#3B82F6">'+q.nodeCount+' / '+cnt+'</div>'+
      '<div style="display:flex;gap:8px;margin-top:4px;justify-content:center">'+
        '<div><div style="font-size:9px;color:#8C8C9E">待回款</div><div style="font-size:12px;font-weight:700;color:#EF4444">'+fmtWan(q.expected-q.actual)+'万</div></div>'+
        '<div><div style="font-size:9px;color:#8C8C9E">已回款</div><div style="font-size:12px;font-weight:700;color:#10B981">'+fmtWan(q.actual)+'万</div></div>'+
      '</div></div>';
  });
  html+='</div></div></div>';

  var signalBase=delayedTotal+urgent+d15total+d30total;
  var totalNotFlw=Math.max(0,signalBase-totalFlw);
  html+='<div style="display:flex;gap:14px;margin-bottom:16px">'+
    '<div class="card" style="flex:1;min-width:0"><div class="card-body" style="text-align:center;padding:18px 14px"><div style="font-size:11px;color:#8C8C9E;margin-bottom:4px">7天内待回款</div><div style="font-size:28px;font-weight:800;color:#F97316">'+urgent+'</div></div></div>'+
    '<div class="card" style="flex:1;min-width:0"><div class="card-body" style="text-align:center;padding:18px 14px"><div style="font-size:11px;color:#8C8C9E;margin-bottom:4px">8~15天内待回款</div><div style="font-size:28px;font-weight:800;color:#F59E0B">'+d15total+'</div></div></div>'+
    '<div class="card" style="flex:1;min-width:0"><div class="card-body" style="text-align:center;padding:18px 14px"><div style="font-size:11px;color:#8C8C9E;margin-bottom:4px">16~30天内待回款</div><div style="font-size:28px;font-weight:800;color:#3B82F6">'+d30total+'</div></div></div>'+
    '<div class="card" style="flex:1;min-width:0"><div class="card-body" style="text-align:center;padding:18px 14px"><div style="font-size:11px;color:#8C8C9E;margin-bottom:4px">延期</div><div style="font-size:28px;font-weight:800;color:#DC2626">'+delayedTotal+'</div></div></div>'+
    '<div class="card" style="flex:1;min-width:0"><div class="card-body" style="text-align:center;padding:18px 14px"><div style="font-size:11px;color:#8C8C9E;margin-bottom:4px">已跟进</div><div style="font-size:28px;font-weight:800;color:#10B981">'+totalFlw+'</div></div></div>'+
    '<div class="card" style="flex:1;min-width:0"><div class="card-body" style="text-align:center;padding:18px 14px"><div style="font-size:11px;color:#8C8C9E;margin-bottom:4px">待跟进</div><div style="font-size:28px;font-weight:800;color:#8C8C9E">'+totalNotFlw+'</div></div></div>'+
    '</div>';

  html+='<div style="margin-bottom:12px"><input type="text" id="fuSearch" placeholder="搜索 L4 部门..." style="width:240px;padding:8px 12px;border:1px solid #E2E0DC;border-radius:6px;font-size:13px" oninput="window._filterFollowup()"></div>';

  html+='<div class="card"><div class="card-header" style="display:flex;align-items:center;gap:12px"><span>临期回款进度跟进</span><span style="font-size:10px;color:#8C8C9E;font-weight:400">橙色7天  黄色8~15天  蓝色16~30天  红色延期 | 点击跟进动态查看详情</span></div><div class="card-body" style="padding:0">';
  // Header
  html+='<div class="signal-row" style="font-size:12px;color:#8C8C9E;font-weight:600;cursor:default;background:#FAFBFC">'+
    '<div class="signal-rank" style="font-size:12px">序号</div>'+
    '<div class="signal-dept" style="font-size:12px">L4部门</div>'+
    '<div class="signal-bars">'+
      '<div class="signal-bar-group"><span class="signal-bar-label" style="font-size:12px;display:inline-block;width:auto;min-width:60px;white-space:nowrap">7天内待回款项目</span><div class="signal-bar-wrap" style="visibility:hidden"><div class="signal-bar-fill"></div></div></div>'+
      '<div class="signal-bar-group"><span class="signal-bar-label" style="font-size:12px;display:inline-block;width:auto;min-width:60px;white-space:nowrap">8~15天内待回款项目</span><div class="signal-bar-wrap" style="visibility:hidden"><div class="signal-bar-fill"></div></div></div>'+
      '<div class="signal-bar-group"><span class="signal-bar-label" style="font-size:12px;display:inline-block;width:auto;min-width:60px;white-space:nowrap">16~30天内待回款项目</span><div class="signal-bar-wrap" style="visibility:hidden"><div class="signal-bar-fill"></div></div></div>'+
      '<div class="signal-bar-group"><span class="signal-bar-label" style="font-size:12px;display:inline-block;width:auto;min-width:60px;white-space:nowrap">延期项目</span><div class="signal-bar-wrap" style="visibility:hidden"><div class="signal-bar-fill"></div></div></div>'+
    '</div>'+
    '<div class="signal-rate" style="font-size:12px">跟进率</div>'+
    '<div class="signal-action" style="font-size:12px">操作</div>'+
    '</div>';

  window._followupStats = stats;

  window._renderFollowupRows = function(filteredStats){
    var maxDelay=Math.max.apply(null,filteredStats.map(function(d){return d.delay||0;}).concat([1]));
    var maxD30f=Math.max.apply(null,filteredStats.map(function(d){return d.d30;}).concat([1]));
    var maxD15f=Math.max.apply(null,filteredStats.map(function(d){return d.d15;}).concat([1]));
    var maxD7f=Math.max.apply(null,filteredStats.map(function(d){return d.d7;}).concat([1]));
    var rowsHtml='';
    filteredStats.forEach(function(d,i){
      var rate=d.total>0?Math.round(d.flw/d.total*100):0;
      var deptAttr=d.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      rowsHtml+='<div class="signal-row" style="cursor:pointer" data-dept="'+deptAttr+'">'+
        '<div class="signal-rank" style="color:'+(i===0?'#EF4444':i===1?'#F59E0B':'#8C8C9E')+'">'+(i+1)+'</div>'+
        '<div class="signal-dept" onclick="event.stopPropagation();_fuExpandEl(this)">'+
          '<div class="signal-dept-name">'+d.name+'</div>'+
          '<div class="signal-dept-count">共'+d.total+'个项目</div>'+
        '</div>'+
        '<div class="signal-bars">'+
          '<div class="signal-bar-group" onclick="event.stopPropagation();_fuExpandEl(this,&quot;d7&quot;)" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:2px" title="点击查看7天内到期项目"><div style="display:flex;align-items:center;gap:8px"><div class="signal-bar-wrap"><div class="signal-bar-fill" style="width:'+(maxD7f>0?d.d7/Math.max(maxD7f,1)*100:0).toFixed(0)+'%;background:#F97316"></div></div><span class="signal-bar-num" style="color:#F97316;font-weight:800">'+d.d7+'</span></div><div style="font-size:11px;color:#8C8C9E;text-align:center">已跟进'+(d.d7flw||0)+'/待跟进'+(d.d7-(d.d7flw||0))+'个</div></div>'+
          '<div class="signal-bar-group" onclick="event.stopPropagation();_fuExpandEl(this,&quot;d15&quot;)" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:2px" title="点击查看8~15天内到期项目"><div style="display:flex;align-items:center;gap:8px"><div class="signal-bar-wrap"><div class="signal-bar-fill" style="width:'+(maxD15f>0?d.d15/maxD15f*100:0).toFixed(0)+'%;background:#F59E0B"></div></div><span class="signal-bar-num" style="color:#F59E0B">'+d.d15+'</span></div><div style="font-size:11px;color:#8C8C9E;text-align:center">已跟进'+(d.d15flw||0)+'/待跟进'+(d.d15-(d.d15flw||0))+'个</div></div>'+
          '<div class="signal-bar-group" onclick="event.stopPropagation();_fuExpandEl(this,&quot;d30&quot;)" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:2px" title="点击查看16~30天内到期项目"><div style="display:flex;align-items:center;gap:8px"><div class="signal-bar-wrap"><div class="signal-bar-fill" style="width:'+(maxD30f>0?d.d30/maxD30f*100:0).toFixed(0)+'%;background:#3B82F6"></div></div><span class="signal-bar-num" style="color:#3B82F6">'+d.d30+'</span></div><div style="font-size:11px;color:#8C8C9E;text-align:center">已跟进'+(d.d30flw||0)+'/待跟进'+(d.d30-(d.d30flw||0))+'个</div></div>'+
          '<div class="signal-bar-group" onclick="event.stopPropagation();_fuExpandEl(this,&quot;delay&quot;)" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:2px" title="点击查看已延期项目"><div style="display:flex;align-items:center;gap:8px"><div class="signal-bar-wrap"><div class="signal-bar-fill" style="width:'+(maxDelay>0?(d.delay||0)/maxDelay*100:0).toFixed(0)+'%;background:#DC2626"></div></div><span class="signal-bar-num" style="color:#DC2626;font-weight:800">'+(d.delay||0)+'</span></div><div style="font-size:11px;color:#8C8C9E;text-align:center">已跟进'+(d.delayFlw||0)+'/待跟进'+((d.delay||0)-(d.delayFlw||0))+'个</div></div>'+
        '</div>'+
        '<div class="signal-rate" style="color:'+(rate>=80?'#10B981':rate>=50?'#F59E0B':'#EF4444')+'">'+rate+'%</div>'+
        '<div class="signal-action" style="position:relative"><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();var m=document.getElementById(&quot;fumenu_'+i+'&quot;);m.style.display=m.style.display===&quot;block&quot;?&quot;none&quot;:&quot;block&quot;">跟进动态 ▾</button>'+
          '<div id="fumenu_'+i+'" style="display:none;position:absolute;top:100%;right:0;background:#fff;border:1px solid #E2E0DC;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:10;min-width:150px;text-align:left" onclick="event.stopPropagation()">'+
            '<div class="fu-menu-item" style="padding:8px 14px;cursor:pointer;font-size:12px;color:#1A1A2E" onclick="_fuMenuExpand(this)">全部项目</div>'+
            '<div class="fu-menu-item" style="padding:8px 14px;cursor:pointer;font-size:12px;color:#DC2626" onclick="_fuMenuExpand(this,&quot;delay&quot;)">已延期项目</div>'+
            '<div class="fu-menu-item" style="padding:8px 14px;cursor:pointer;font-size:12px;color:#3B82F6" onclick="_fuMenuExpand(this,&quot;d30&quot;)">16~30天内到期项目</div>'+
            '<div class="fu-menu-item" style="padding:8px 14px;cursor:pointer;font-size:12px;color:#F59E0B" onclick="_fuMenuExpand(this,&quot;d15&quot;)">8~15天内到期项目</div>'+
            '<div class="fu-menu-item" style="padding:8px 14px;cursor:pointer;font-size:12px;color:#F97316" onclick="_fuMenuExpand(this,&quot;d7&quot;)">7天内到期项目</div>'+
          '</div>'+
        '</div>'+
        '</div>';
    });
    return rowsHtml;
  };

  html+='<div id="followupRows">'+window._renderFollowupRows(stats)+'</div>';
  html+='</div></div>';
  page.innerHTML=html;
  // 季度回款概览标题：括号内文字设置靛紫色
  var qTitle=document.getElementById('fuQTitle');
  if(qTitle){
    var txt=qTitle.textContent||'';
    var p=txt.indexOf('(');
    if(p>=0){
      qTitle.innerHTML=txt.substring(0,p)+'<span style=\"color:#6366F1\">'+txt.substring(p)+'</span>';
    }
  }

  window._filterFollowup = function(){
    var q = (document.getElementById('fuSearch')?.value || '').toLowerCase();
    var filtered = window._followupStats || [];
    if(q){ filtered = filtered.filter(function(d){ return d.name.toLowerCase().indexOf(q) >= 0; }); }
    var rowsEl = document.getElementById('followupRows');
    if(rowsEl) rowsEl.innerHTML = window._renderFollowupRows(filtered);
  };
};

// ==================== 展开面板 ====================
window._fuDeptProjects = function(deptName){
  var nodes=getFilteredNodes().filter(function(n){return n.isPaymentRelated && (n.orgL4||'未分配')===deptName;});
  var projMap={};
  nodes.forEach(function(n){
    var pid=n.projectId||'';if(!pid)return;
    if(!projMap[pid]){
      projMap[pid]={projectId:pid,projectName:n.projectName||'',projectManager:n.projectManager||'',orgL4:n.orgL4||deptName,projectAmount:n.projectAmount||0,nodes:[],earliestPlanDate:'',latestPlanDate:''};
    }
    projMap[pid].nodes.push(n);
    if(n.planDate){
      if(!projMap[pid].earliestPlanDate||n.planDate<projMap[pid].earliestPlanDate)projMap[pid].earliestPlanDate=n.planDate;
      if(!projMap[pid].latestPlanDate||n.planDate>projMap[pid].latestPlanDate)projMap[pid].latestPlanDate=n.planDate;
    }
    if(n.projectCompletion && n.projectCompletion!=='空值'){
      var cp=pctToNum(n.projectCompletion)||0;
      if(cp>(projMap[pid]._maxCompletion||0)){projMap[pid]._maxCompletion=cp;projMap[pid].completion=n.projectCompletion;}
    }
  });
  Object.keys(projMap).forEach(function(pid){
    var p=projMap[pid];
    p.nodeStatuses=p.nodes.map(function(n){return n.nodeStatus;}).filter(Boolean);
    var fu=_fuGet(pid);p.flw=fu.flw;p.st=fu.st;p.fb=fu.fb;
    p.projectAmountWan=Math.round((p.projectAmount||0)/10000*100)/100;
    p.completion=p.completion||'-';
    p.earliestPlanDate=p.earliestPlanDate||'-';
  });
  return Object.values(projMap);
};

window._openFuExpand = function(deptName, timeWin){
  // Count matching NODES using same logic as progress bars
  var allNodes=getFilteredNodes().filter(function(n){return n.isPaymentRelated&&(n.orgL4||'未分配')===deptName;});
  var today=new Date();
  var filteredNodes=allNodes.filter(function(n){
    if(timeWin==='delay')return n.nodeStatus==='延期';
    if(!timeWin)return true;
    if(!n.planDate)return false;
    // Match calendar: exclude paid (unified: all tiers use actualPaymentRatio)
    var ar3=pctToNum(n.actualPaymentRatio);if(ar3!==null&&ar3>=1)return false;
    var d=new Date(n.planDate);if(d<today)return false;
    var diff=Math.ceil((d-today)/86400000);
    if(timeWin==='d7')return diff<=7;
    if(timeWin==='d15')return diff<=15;
    if(timeWin==='d30')return diff<=30;
    return true;
  });
  var nodeCount=filteredNodes.length;
  // Count projects directly from filteredNodes (guarantees consistent counts)
  var projSet={}; filteredNodes.forEach(function(n){ if(n.projectId) projSet[n.projectId]=true; });
  var projCount=Object.keys(projSet).length;

  // Also get project details for the right panel
  var allProjs=window._fuDeptProjects(deptName);
  var projs=allProjs.filter(function(p){ return projSet[p.projectId]; });
  var flwCount=projs.filter(function(p){return p.flw;}).length;

  // Left panel stats — node count matches progress bar
  var timeLabel='';
  if(timeWin==='delay')timeLabel=' (已延期)';
  else if(timeWin==='d7')timeLabel=' (7天内到期)';
  else if(timeWin==='d15')timeLabel=' (15天内到期)';
  else if(timeWin==='d30')timeLabel=' (30天内到期)';

  var flwRate=projCount>0?Math.round(flwCount/projCount*100):0;
  var flwRemaining=projCount-flwCount;
  var rateColor=flwRate>=80?'#10B981':flwRate>=50?'#F59E0B':'#EF4444';
  // 到期紧迫度统计
  var today=new Date();
  var urgency={delay:0,d7:0,d15:0,d30:0};
  filteredNodes.forEach(function(n){
    if(n.nodeStatus==='延期') urgency.delay++;
    else if(n.planDate){
      var d=new Date(n.planDate); var diff=Math.ceil((d-today)/86400000);
      if(diff<=7) urgency.d7++;
      else if(diff<=15) urgency.d15++;
      else if(diff<=30) urgency.d30++;
    }
  });
  var maxUrgency=Math.max(urgency.delay,urgency.d7,urgency.d15,urgency.d30,1);

  var leftHtml='<div style=\"margin-bottom:2px\"><span style=\"font-size:15px;font-weight:700;color:#6366F1\">'+deptName+'</span><span style=\"font-size:15px;font-weight:700;color:#1A1A2E\">'+timeLabel+'</span></div>';
  leftHtml+='<div style=\"font-size:15px;font-weight:700;color:#1A1A2E;margin-bottom:16px\">涉及 '+projCount+' 个项目 · 共 '+nodeCount+' 个节点</div>';

  // 环形图单独一行，居中铺满 (220px)
  var circ=2*Math.PI*75, dashOffset=circ-(circ*flwRate/100);
  leftHtml+='<div style=\"text-align:center;margin-bottom:16px\">';
  leftHtml+='<div style=\"position:relative;display:inline-block;width:220px;height:220px\">';
  leftHtml+='<svg width=\"220\" height=\"220\" viewBox=\"0 0 220 220\" style=\"transform:rotate(-90deg)\">';
  leftHtml+='<circle cx=\"110\" cy=\"110\" r=\"75\" fill=\"none\" stroke=\"#EBE7E2\" stroke-width=\"14\"/>';
  leftHtml+='<circle cx=\"110\" cy=\"110\" r=\"75\" fill=\"none\" stroke=\"'+rateColor+'\" stroke-width=\"14\" stroke-linecap=\"round\" stroke-dasharray=\"'+circ.toFixed(1)+'\" stroke-dashoffset=\"'+dashOffset.toFixed(1)+'\" style=\"transition:stroke-dashoffset .6s ease\"/>';
  leftHtml+='</svg>';
  leftHtml+='<div style=\"position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center\">';
  leftHtml+='<div style=\"font-size:22px;font-weight:900;color:'+rateColor+';line-height:1.2\">'+flwRate+'%</div>';
  leftHtml+='<div style=\"font-size:13px;color:#8C8C9E\">跟进率</div>';
  leftHtml+='</div></div></div>';

  // 待跟进 + 已跟进 卡片并排一行
  leftHtml+='<div style=\"display:flex;gap:10px;margin-bottom:16px\">';
  leftHtml+='<div style=\"flex:1;text-align:center;padding:14px 8px;background:#FEF2F2;border-radius:8px;border-left:3px solid #EF4444\">';
  leftHtml+='<div style=\"font-size:16px;font-weight:800;color:#EF4444;line-height:1.3\">'+flwRemaining+'</div>';
  leftHtml+='<div style=\"font-size:13px;color:#EF4444;font-weight:600;margin-top:3px\">待跟进</div>';
  leftHtml+='</div>';
  leftHtml+='<div style=\"flex:1;text-align:center;padding:14px 8px;background:#ECFDF5;border-radius:8px;border-left:3px solid #10B981\">';
  leftHtml+='<div style=\"font-size:16px;font-weight:800;color:#10B981;line-height:1.3\">'+flwCount+'</div>';
  leftHtml+='<div style=\"font-size:13px;color:#10B981;font-weight:600;margin-top:3px\">已跟进</div>';
  leftHtml+='</div>';
  leftHtml+='</div>';

  // 到期紧迫度分布条
  leftHtml+='<div style=\"font-size:13px;font-weight:600;color:#8C8C9E;margin-bottom:8px;letter-spacing:.3px\">到期紧迫度</div>';
  var urgencyItems=[
    {label:'已延期',count:urgency.delay,color:'#DC2626'},
    {label:'7天内到期',count:urgency.d7,color:'#F97316'},
    {label:'8~15天到期',count:urgency.d15,color:'#F59E0B'},
    {label:'16~30天到期',count:urgency.d30,color:'#3B82F6'}
  ];
  urgencyItems.forEach(function(item){
    var barW=maxUrgency>0?Math.round(item.count/maxUrgency*100):0;
    leftHtml+='<div style=\"display:flex;align-items:center;gap:8px;margin-bottom:7px\">';
    leftHtml+='<span style=\"font-size:13px;color:#8C8C9E;width:76px;flex-shrink:0;text-align:right\">'+item.label+'</span>';
    leftHtml+='<div style=\"flex:1;height:11px;background:#F1F5F9;border-radius:5px;overflow:hidden\">';
    leftHtml+='<div style=\"height:100%;width:'+barW+'%;background:'+item.color+';border-radius:5px;transition:width .4s ease\"></div>';
    leftHtml+='</div>';
    leftHtml+='<span style=\"font-size:14px;font-weight:700;color:#1A1A2E;min-width:20px;text-align:right\">'+item.count+'</span>';
    leftHtml+='</div>';
  });
  leftHtml+='<hr class=\"followup-divider\">';
  leftHtml+='<div class=\"followup-section-label\">跟进状态筛选</div>';
  leftHtml+='<select class=\"followup-select\" id=\"fuFbFilter\" onchange=\"window._renderFuRight(window._fuDeptName)\"><option value=\"all\">全部项目</option><option value=\"flw\">已跟进</option><option value=\"noflw\">未跟进</option><option value=\"7d\">7天内到期</option><option value=\"15d\">15天内到期</option></select>';
  leftHtml+='<hr class=\"followup-divider\">';
  leftHtml+='<div class=\"followup-section-label\">批量操作</div>';
  leftHtml+='<select class=\"followup-select\" id=\"fuBatchFlw\" onchange=\"window._fuBatchFlw(this.value)\"><option value=\"\">批量设置跟进...</option><option value=\"1\">全部标记已跟进</option><option value=\"0\">全部标记未跟进</option></select>';
  leftHtml+='<hr class=\"followup-divider\">';
  leftHtml+='<div style=\"font-size:11px;color:#8C8C9E;line-height:1.6;white-space:nowrap\">提示: 点击项目行可展开查看回款节点详细信息</div>';
  document.getElementById('fuLeft').innerHTML=leftHtml;

  // Store the time window for _renderFuRight to use
  window._fuTimeWin = timeWin||'';

  // Right panel - initial render
  window._renderFuRight(deptName);

  // Show panel
  document.getElementById('fuPanel').classList.add('open');
  document.getElementById('fuOverlay').classList.add('show');
}

// 刷新左侧统计数据（筛选切换时联动更新环形图/待跟进/已跟进/紧迫度）
window._updateFuLeftStats = function(deptName){
  var allNodes=getFilteredNodes().filter(function(n){return n.isPaymentRelated&&(n.orgL4||'未分配')===deptName;});
  var today=new Date(); var tw=window._fuTimeWin||'';
  var filteredNodes=allNodes.filter(function(n){
    if(tw==='delay')return n.nodeStatus==='延期';
    if(!tw)return true;
    if(!n.planDate)return false;
    var ar3=pctToNum(n.actualPaymentRatio);if(ar3!==null&&ar3>=1)return false;
    var d=new Date(n.planDate);if(d<today)return false;
    var diff=Math.ceil((d-today)/86400000);
    if(tw==='d7')return diff<=7;
    if(tw==='d15')return diff<=15;
    if(tw==='d30')return diff<=30;
    return true;
  });
  var projSet={}; filteredNodes.forEach(function(n){ if(n.projectId) projSet[n.projectId]=true; });
  var projs=window._fuDeptProjects(deptName).filter(function(p){ return projSet[p.projectId]; });
  // 应用筛选
  var filterEl=document.getElementById('fuFbFilter'); var fval=filterEl?filterEl.value:'all';
  if(fval==='flw') projs=projs.filter(function(p){return p.flw;});
  else if(fval==='noflw') projs=projs.filter(function(p){return !p.flw;});
  var nodeCount=filteredNodes.length;
  var projCount=projs.length;
  var flwCount=projs.filter(function(p){return p.flw;}).length;
  var flwRate=projCount>0?Math.round(flwCount/projCount*100):0;
  var flwRemaining=projCount-flwCount;
  var rateColor=flwRate>=80?'#10B981':flwRate>=50?'#F59E0B':'#EF4444';
  // 环形图
  var circ=2*Math.PI*75; var dashOffset=circ-(circ*flwRate/100);
  var donut=document.querySelector('#fuLeft svg circle:nth-child(2)');
  if(donut){ donut.setAttribute('stroke',rateColor); donut.setAttribute('stroke-dashoffset',dashOffset.toFixed(1)); }
  var donutPct=document.querySelector('#fuLeft svg+div div:first-child');
  if(donutPct){ donutPct.textContent=flwRate+'%'; donutPct.style.color=rateColor; }
  // 待跟进/已跟进
  var remainEl=document.querySelector('#fuLeft [style*=\"FEF2F2\"] div:first-child');
  var flwEl=document.querySelector('#fuLeft [style*=\"ECFDF5\"] div:first-child');
  if(remainEl) remainEl.textContent=flwRemaining;
  if(flwEl) flwEl.textContent=flwCount;
  // 涉及节点/项目
  var metaEl=document.querySelector('#fuLeft [style*=\"margin-bottom:16px\"]');
  if(metaEl) metaEl.innerHTML='涉及 '+projCount+' 个项目 · 共 '+nodeCount+' 个节点';
};

window._closeFuExpand = function(){
  document.getElementById('fuPanel').classList.remove('open');
  document.getElementById('fuOverlay').classList.remove('show');
  // Refresh signal board to reflect follow-up changes
  if(window.initFollowup) window.initFollowup();
};
// Helper: read data-dept from row element and call _openFuExpand
window._fuExpandEl = function(el, timeWin){
  var row=el.closest('[data-dept]');
  var dept=row?row.getAttribute('data-dept'):'';
  if(dept)window._openFuExpand(dept, timeWin||'');
};
window._fuMenuExpand = function(el, timeWin){
  var row=el.closest('[data-dept]');
  var menu=el.closest('[id^=\"fumenu_\"]');
  var dept=row?row.getAttribute('data-dept'):'';
  if(menu)menu.style.display='none';
  if(dept)window._openFuExpand(dept, timeWin||'');
};
// Close followup dropdowns when clicking outside
document.addEventListener('click', function(e){
  if(!e.target.closest('.signal-action')){var menus=document.querySelectorAll('[id^=\"fumenu_\"]');for(var i=0;i<menus.length;i++)menus[i].style.display='none';}
});

window._renderFuRight = function(deptName){
  var projs=window._fuDeptProjects(deptName);
  var filterEl=document.getElementById('fuFbFilter');
  var fval=filterEl?filterEl.value:'all';
  var today=new Date();

  // Store deptName for event handlers
  window._fuDeptName = deptName;

  // Apply time window filter — match node filter exactly
  var tw=window._fuTimeWin||'';
  if(tw==='delay'){projs=projs.filter(function(p){return p.nodes.some(function(nn){return nn.nodeStatus==='延期';});});}
  else if(tw==='d7'||tw==='d15'||tw==='d30'){
    projs=projs.filter(function(p){return p.nodes.some(function(nn){
      if(!nn.planDate)return false;
      var ar2=pctToNum(nn.actualPaymentRatio);if(ar2!==null&&ar2>=1)return false;
      var d=new Date(nn.planDate);if(d<today)return false;
      var diff=Math.ceil((d-today)/86400000);
      if(tw==='d7')return diff<=7;
      if(tw==='d15')return diff<=15;
      return diff<=30;
    });});
  }

  // Apply dropdown filter
  if(fval==='flw'){projs=projs.filter(function(p){return p.flw;});}
  else if(fval==='noflw'){projs=projs.filter(function(p){return !p.flw;});}
  else if(fval==='7d'||fval==='15d'){projs=projs.filter(function(p){return p.nodes.some(function(nn){
    if(!nn.planDate)return false;
    var ar2=pctToNum(nn.actualPaymentRatio);if(ar2!==null&&ar2>=1)return false;
    var d=new Date(nn.planDate);if(d<today)return false;
    var diff=Math.ceil((d-today)/86400000);
    if(fval==='7d')return diff<=7;return diff<=15;
  });});}

  var flwCount=projs.filter(function(p){return p.flw;}).length;

  var rightHtml='<h3>项目列表</h3>';
  rightHtml+='<div class=\"pr-count\" style=\"font-size:11px;color:#8C8C9E;margin-bottom:16px\">共 '+projs.length+' 个项目 | 已跟进 '+flwCount+'/'+projs.length+'</div>';

  projs.forEach(function(p){
    var diffDays='-';
    if(p.earliestPlanDate && p.earliestPlanDate!=='-'){diffDays=Math.ceil((new Date(p.earliestPlanDate)-today)/86400000);}
    var isUrgent=diffDays!=='-'&&diffDays<=7;
    var isWarning=diffDays!=='-'&&diffDays>7&&diffDays<=15;
    var rowClass='followup-pr-row'+(isUrgent?' urgent':isWarning?' warning':'');
    var statuses=p.nodeStatuses.slice(0,3).join(', ');
    var fu=_fuGet(p.projectId);
    var flwBorderColor=fu.flw?'#10B981':'#F59E0B';
    var pidEsc=p.projectId.replace(/'/g,'&#39;');
    var pnEsc=p.projectName.replace(/'/g,'&#39;');

    rightHtml+='<div class=\"'+rowClass+'\" style=\"display:block;padding:14px;border-left:4px solid '+flwBorderColor+';position:relative\">'+
      '<div style=\"display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px\">'+
        '<div class=\"followup-pr-name\" style=\"flex:1;min-width:0;font-weight:700;font-size:14px\">'+p.projectName.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</div>'+
        '<div style=\"display:flex;gap:8px;align-items:center;flex-shrink:0\">'+
          '<button class=\"btn btn-outline btn-sm\" onclick=\"event.stopPropagation();_fuToggleNodes(this)\" data-pid=\"'+p.projectId+'\">展开</button>'+
          '<button class=\"btn btn-primary btn-sm\" onclick=\"event.stopPropagation();window._fuDrillToNode(&quot;'+p.projectId+'&quot;,&quot;'+pnEsc.replace(/&/g,'&amp;')+'&quot;)\" title=\"跳转到回款节点\">下钻详情</button>'+
          '<select class=\"followup-select\" style=\"width:90px;margin:0;flex-shrink:0\" data-pid=\"'+p.projectId+'\" onchange=\"window._fuChangeFlw(this)\"><option value=\"0\" '+(fu.flw?'':'selected')+'>待跟进</option><option value=\"1\" '+(fu.flw?'selected':'')+'>已跟进</option></select>'+
        '</div>'+
      '</div>'+
      '<div class=\"followup-pr-meta\" style=\"display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#8C8C9E\"><span>'+p.projectId+'</span><span>'+p.orgL4+'</span><span>'+p.projectManager+'</span><span>¥'+p.projectAmountWan+'万</span><span>到期: '+p.earliestPlanDate+'</span><span>完成: '+p.completion+'</span><span>状态: '+statuses+'</span></div>'+
      '<div id=\"funodes_'+p.projectId.replace(/[^a-zA-Z0-9_-]/g,'_')+'\" style=\"display:none;margin-top:6px;padding:0 0 0 8px;border-left:2px solid #E2E0DC\">'+
        _renderFuNodeTable(p.nodes)+
        window._renderFollowupSection(p.projectId, p.projectName, p.nodes.length>0?p.nodes[0].nextActionDate:'')+
      '</div>'+
      '<div id=\"fubadge_'+p.projectId.replace(/[^a-zA-Z0-9_-]/g,'_')+'\" style=\"display:none;position:absolute;bottom:0;right:0;width:30px;height:30px;background:linear-gradient(to top left,#3B82F6 50%,transparent 50%);border-bottom-right-radius:10px;align-items:flex-end;justify-content:flex-end;padding:0 6px 4px 0;box-sizing:border-box\"><span style=\"color:#fff;font-size:11px;font-weight:700;line-height:1\"></span></div>'+
      '</div>';
  });

  if(!projs.length) rightHtml+='<div style=\"text-align:center;padding:30px;color:#8C8C9E\">暂无匹配项目</div>';
  // 保存展开的项目ID（data-pid 直接可用）
  var expandedPids=[];
  document.querySelectorAll('#fuRight [data-pid]').forEach(function(btn){
    var pid=btn.getAttribute('data-pid');
    if(pid){ var nd=document.getElementById('funodes_'+pid.replace(/[^a-zA-Z0-9_-]/g,'_')); if(nd&&nd.style.display!=='none') expandedPids.push(pid); }
  });
  document.getElementById('fuRight').innerHTML=rightHtml;
  // 恢复展开状态 + 按钮文字
  expandedPids.forEach(function(epid){
    var div=document.getElementById('funodes_'+epid.replace(/[^a-zA-Z0-9_-]/g,'_'));
    if(div){div.style.display='block';}
    var btn=document.querySelector('#fuRight [data-pid=\"'+epid+'\"]');
    if(btn) btn.textContent='收起';
  });
  // 自动加载各项目的跟进记录
  projs.forEach(function(p){ setTimeout(function(){ window._loadFollowupRecords(p.projectId); }, 100); });
  // 更新左侧统计数字
  window._updateFuLeftStats(deptName);
}

// Toggle expand node detail table
window._fuToggleNodes = function(btn){
  var pid=btn.getAttribute('data-pid');
  var div=document.getElementById('funodes_'+pid.replace(/[^a-zA-Z0-9_-]/g,'_'));
  if(!div)return;
  if(div.style.display==='none'){div.style.display='block';btn.textContent='收起';}
  else{div.style.display='none';btn.textContent='展开';}
};
// Render node detail mini-table
function _renderFuNodeTable(nodes){
  // 过滤实际回款100%的节点
  nodes=nodes.filter(function(n){var ar=pctToNum(n.actualPaymentRatio);return ar===null||ar<1;});
  if(!nodes||!nodes.length)return '<div style=\"font-size:13px;color:#8C8C9E;padding:8px 0\">暂无待跟进节点（已全额回款的节点已自动隐藏）</div>';
  function _fd(v){if(!v)return'';var ed=excelDate(v);if(ed)return ed;if(typeof v==='string'&&/^\d{4}-\d{2}/.test(v))return v.substring(0,10);return v;}
  function _esc(s){ var raw=String(s||''); return raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _td(val,isDate){ var raw=isDate?_fd(val):(val!=null?String(val):''); var full=_esc(raw); var display=raw.length>26?raw.substring(0,26)+'....':raw; return '<td style=\"padding:5px 6px;border:1px solid #EBE7E2\" data-cell-tooltip=\"'+full+'\">'+_esc(display)+'</td>'; }
  var h='<table style=\"width:100%;font-size:13px;border-collapse:collapse;margin:4px 0\" class=\"data-table\"><thead><tr style=\"background:#FAFBFC\">'+
    '<th style=\"padding:5px 6px;border:1px solid #EBE7E2;text-align:left;white-space:nowrap\">节点</th><th style=\"padding:5px 6px;border:1px solid #EBE7E2;white-space:nowrap\">计划日期</th><th style=\"padding:5px 6px;border:1px solid #EBE7E2;white-space:nowrap\">计划回款%</th><th style=\"padding:5px 6px;border:1px solid #EBE7E2;white-space:nowrap\">实际回款%</th><th style=\"padding:5px 6px;border:1px solid #EBE7E2;white-space:nowrap\">状态</th><th style=\"padding:5px 6px;border:1px solid #EBE7E2;white-space:nowrap\">卡点</th><th style=\"padding:5px 6px;border:1px solid #EBE7E2;white-space:nowrap\">卡点责任方</th><th style=\"padding:5px 6px;border:1px solid #EBE7E2;white-space:nowrap\">下一步动作</th><th style=\"padding:5px 6px;border:1px solid #EBE7E2;white-space:nowrap\">动作完成时间</th></tr></thead><tbody>';
  nodes.forEach(function(n){
    h+='<tr>'+
      _td(n.nodeName)+
      _td(n.planDate,true)+
      _td(n.planPaymentRatio)+
      _td(n.actualPaymentRatio)+
      _td(n.nodeStatus)+
      _td(n.blocker)+
      _td(n.blockerOwner)+
      _td(n.nextAction)+
      _td(n.nextActionDate,true)+
      '</tr>';
  });
  h+='</tbody></table>';
  return h;
}

// ======== 共享数据层 ========
function _fuDrillData(projectId){
  var ovProj = null;
  var ovProjs = (D.projectOverview && D.projectOverview.projects) ? D.projectOverview.projects : [];
  for(var i=0;i<ovProjs.length;i++){ if(ovProjs[i].projectId===projectId){ ovProj=ovProjs[i]; break; } }
  var allNodes = getFilteredNodes().filter(function(n){ return n.projectId===projectId; });
  function _sortByDate(arr){ arr.sort(function(a,b){ var da=a.planDate?new Date(a.planDate):new Date('2099'); var db=b.planDate?new Date(b.planDate):new Date('2099'); return da-db; }); }
  var groups = {delay:[],advance:[],reached:[],early:[],ontime:[],paid:[]};
  allNodes.forEach(function(n){
    if(n.nodeStatus==='延期') groups.delay.push(n);
    else if(n.nodeStatus==='加资源可提前') groups.advance.push(n);
    else if(n.nodeStatus==='达到回款条件') groups.reached.push(n);
    else if(n.nodeStatus==='已提前回款') groups.early.push(n);
    else if(n.nodeStatus==='已全额回款') groups.paid.push(n);
    else groups.ontime.push(n); // 正常实施中 + fallback
  });
  for(var k in groups) _sortByDate(groups[k]);
  return {ovProj:ovProj, allNodes:allNodes, groups:groups};
}

// ======== 共享工具 ========
var _D = {};
_D._fd = function(v){ if(!v)return''; var ed=excelDate(v); if(ed)return ed; if(typeof v==='string'&&/^\d{4}-\d{2}/.test(v))return v.substring(0,10); return v; };
_D._esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
_D._fv = function(ov,nodes,k1,k2,fb){ if(ov&&ov[k1]!=null&&ov[k1]!=='')return ov[k1]; if(ov&&ov[k2]!=null&&ov[k2]!=='')return ov[k2]; if(nodes&&nodes.length){var v=nodes[0][k2];if(v!=null&&v!=='')return v;} return fb||'-'; };
_D._fmtAmt = function(v){ if(!v)return'-'; var n=parseFloat(v); if(isNaN(n))return String(v); return (n/10000).toFixed(2)+'万'; };
_D._sc = function(st){ var m={'延期':'#DC2626','加资源可提前':'#8B5CF6','达到回款条件':'#F59E0B','已提前回款':'#10B981','已全额回款':'#059669','正常实施中':'#3B82F6'}; return m[st]||'#6B7280'; };
_D._sb = function(st){ return _D._sc(st)+'14'; };
_D._groupDefs = [
  {key:'delay',   label:'延期节点',       color:'#DC2626', tip:'需重点关注'},
  {key:'advance', label:'加资源可提前节点', color:'#8B5CF6', tip:''},
  {key:'reached', label:'达到回款条件节点', color:'#F59E0B', tip:''},
  {key:'early',   label:'已提前回款节点',   color:'#10B981', tip:''},
  {key:'ontime',  label:'正常实施中节点',   color:'#3B82F6', tip:''},
  {key:'paid',    label:'已全额回款节点',   color:'#9CA3AF', tip:''}
];
_D._kv = function(l,v){ var s=v!=null&&v!==''?String(v):'-'; return '<div class="di"><span class="dil">'+l+'</span><span class="div">'+_D._esc(s)+'</span></div>'; };

// ======== 共享：项目总览全部字段（合并去重后 18 字段，支持排除摘要字段）========
_D._renderOvFields = function(ovProj, allNodes, cols, exclude){
  var ff = [
    {l:'项目编号',k1:'项目编号',k2:'projectId'},{l:'项目名称',k1:'项目名称',k2:'projectName'},
    {l:'项目经理(FR)',k1:'项目经理（FR）',k2:'projectManager'},{l:'FR L3-1部门',k1:'项目经理L3-1部门',k2:'orgL3'},
    {l:'FR L4部门',k1:'项目经理L4部门',k2:'orgL4'},{l:'项目类型',k1:'项目类型',k2:'projectType'},
    {l:'项目级别',k1:'项目级别',k2:'项目级别'},{l:'项目金额',k1:'项目金额（元）',k2:'projectAmount',amt:true},
    {l:'项目分层',k1:'项目分层',k2:'amountTier'},{l:'是否维保',k1:'是否维保类项目',k2:'isMaintenance'},
    {l:'合同编号',k1:'合同编号',k2:'合同编号'},{l:'客户经理(AR)',k1:'客户经理（AR）',k2:'客户经理（AR）'},
    {l:'营销一级部门',k1:'营销一级部门',k2:'营销一级部门'},{l:'签约单位',k1:'签约单位',k2:'signUnit'},
    {l:'最终客户',k1:'最终客户',k2:'最终客户'},{l:'签约形式',k1:'签约形式分类',k2:'signType'},
    {l:'纳管',k1:'纳管',k2:'纳管'},{l:'备注',k1:'备注',k2:'备注'},
    {l:'合同验收截图',k1:'合同验收回款时间节点截图',k2:'合同验收回款时间节点截图',img:true},
    {l:'付款条件截图',k1:'合同付款条件截图',k2:'合同付款条件截图',img:true}
  ];
  var ex=exclude||{};
  var h='',c=cols||3;
  for(var i=0;i<ff.length;i++){
    var f=ff[i]; if(ex[f.l]) continue;
    var v=_D._fv(ovProj,allNodes,f.k1,f.k2,'');
    if(f.amt) v=_D._fmtAmt(v);
    else if(f.l==='纳管') v=(v===true||v==='是'||v==='true'?'是':v===false||v==='否'||v==='false'?'否':v||'-');
    else if(f.img){ var sv=String(v||''); v=sv.length>26?sv.substring(0,26)+'...':(sv||'-'); }
    else v=v||'-';
    h+='<div class="di"><span class="dil">'+f.l+'</span><span class="div">'+_D._esc(String(v))+'</span></div>';
  }
  return '<div class="drill-ov-grid cols'+c+'">'+h+'</div>';
};

// ======== 共享：节点字段（5 区域，全量）========
_D._renderNodeFull = function(n, ovProj, allNodes){
  var color=_D._sc(n.nodeStatus), ar=pctToNum(n.actualPaymentRatio), isPaid=ar!==null&&ar>=1;
  var dd=n.delayDays||0, delayStr=dd>0?'<div style="font-size:11px;color:#DC2626;font-weight:700;margin-bottom:4px">延期 '+dd+' 天</div>':'';
  var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">';
  h+='<span style="font-weight:700;font-size:14px;color:#1A1A2E">'+_D._esc(n.nodeName||'')+'</span>';
  h+='<span style="font-size:10px;font-weight:600;padding:3px 10px;border-radius:10px;color:'+color+';background:'+_D._sb(n.nodeStatus)+';white-space:nowrap">'+_D._esc(n.nodeStatus||'')+(isPaid?' · 已全额回款':'')+'</span></div>';
  h+=delayStr;
  // A. 节点计划信息
  h+='<div class="drill-fg"><div class="drill-fg-title">节点计划信息</div><div class="drill-fg-grid cols3">';
  h+=_D._kv('里程碑节点',n.nodeName)+_D._kv('该节点计划完成时间',_D._fd(n.planDate));
  h+=_D._kv('计划时间切片',n.planQuarter)+_D._kv('实际完成时间',_D._fd(n.actualDate));
  h+=_D._kv('里程碑节点完成情况',n.completionStatus)+_D._kv('是否已达成里程碑',n.isMilestoneAchieved);
  h+=_D._kv('预计里程碑完成时间',_D._fd(n.expectedMilestoneDate))+_D._kv('是否加资源可提前',n.canAdvance);
  h+=_D._kv('需求资源/原因说明',n.advanceDetail);
  h+='</div></div>';
  // B. 回款信息
  h+='<div class="drill-fg"><div class="drill-fg-title">回款信息</div><div class="drill-fg-grid cols3">';
  h+=_D._kv('是否关联回款',n.isPaymentRelated?'是':'否')+_D._kv('关联回款比例',n.planPaymentRatio);
  h+=_D._kv('实际回款比例',n.actualPaymentRatio)+_D._kv('当前项目完成%',n.projectCompletion);
  h+=_D._kv('延期天数',dd>0?dd+' 天':'0 天');
  h+='</div></div>';
  // D. 卡点与跟进
  h+='<div class="drill-fg"><div class="drill-fg-title">卡点与跟进</div><div class="drill-fg-grid cols2">';
  h+=_D._kv('卡点',n.blocker)+_D._kv('卡点责任方',n.blockerOwner);
  h+=_D._kv('下一步动作',n.nextAction)+_D._kv('动作完成时间',_D._fd(n.nextActionDate));
  h+='</div></div>';
  // E. 备注
  if(n.remarks||n.remarks2){
    h+='<div class="drill-fg"><div class="drill-fg-title">备注</div><div class="drill-fg-grid cols2">';
    h+=_D._kv('备注',n.remarks)+_D._kv('备注2',n.remarks2);
    h+='</div></div>';
  }
  return h;
};

// ============================================================
//  方案三：摘要卡 + 状态分组折叠面板（唯一方案）
// ============================================================
function _renderFuDrillModal_v3(projectId){
  var d=_fuDrillData(projectId), ov=d.ovProj, ns=d.allNodes, g=d.groups;
  var pn=(ov&&ov.projectName)||(ns.length&&ns[0].projectName)||projectId;
  var h='';

  // --- 项目核心摘要（6字段横向） ---
  var core=[
    {l:'项目编号',v:_D._fv(ov,ns,'项目编号','projectId','')},
    {l:'项目名称',v:_D._esc(pn)},
    {l:'项目金额',v:_D._fmtAmt(_D._fv(ov,ns,'项目金额（元）','projectAmount',''))},
    {l:'项目经理',v:_D._fv(ov,ns,'项目经理（FR）','projectManager','')},
    {l:'客户经理',v:_D._fv(ov,ns,'客户经理（AR）','客户经理（AR）','')},
    {l:'项目级别',v:_D._fv(ov,ns,'项目级别','项目级别','')}
  ];
  var summary='';
  for(var ci=0;ci<core.length;ci++){
    summary+='<div class="di"><span class="dil">'+core[ci].l+'</span><span class="div">'+core[ci].v+'</span></div>';
  }
  var ovId='drillOv3_'+projectId.replace(/[^a-zA-Z0-9_-]/g,'_');
  h+='<div class="drill-section"><div class="drill-panel" style="border:1px solid #EBE7E2;border-radius:8px;overflow:hidden">';
  h+='<div style="padding:12px 14px"><div style="font-weight:700;font-size:14px;color:#1A1A2E;margin-bottom:8px">项目核心摘要</div>';
  h+='<div class="drill-ov-grid cols3">'+summary+'</div>';
  var excludeSummary={'项目编号':1,'项目名称':1,'项目金额':1,'项目经理(FR)':1,'客户经理(AR)':1,'项目级别':1};
  h+='<div class="drill-expand-toggle" onclick="var e=document.getElementById(\''+ovId+'\');var t=this;if(e.style.display===\'none\'){e.style.display=\'block\';t.textContent=\'收起全部字段\'}else{e.style.display=\'none\';t.textContent=\'展开全部 14 个字段\'}" style="margin-top:8px">展开全部 14 个字段</div>';
  h+='<div id="'+ovId+'" style="display:none;padding-top:8px;border-top:1px solid #F0EDE8">'+_D._renderOvFields(ov,ns,3,excludeSummary)+'</div></div></div></div>';

  // --- 节点状态总览 ---
  h+='<div class="drill-section"><div class="drill-section-title">节点状态总览</div><div class="drill-stat-bar">';
  for(var gi=0;gi<_D._groupDefs.length;gi++){ var gd=_D._groupDefs[gi],cnt=g[gd.key].length;
    h+='<div class="drill-stat-item" style="border-left-color:'+gd.color+'"><span class="drill-stat-num">'+cnt+'</span><span class="drill-stat-label">'+gd.label.replace('节点','')+'</span></div>';
  }h+='</div></div>';

  // --- Accordion 分组 ---
  h+='<div class="drill-section"><div class="drill-section-title">回款节点列表（'+ns.length+'）</div>';
  if(!ns.length){ h+='<div style="text-align:center;padding:30px;color:#8C8C9E">暂无回款节点数据</div>'; }
  for(var gi2=0;gi2<_D._groupDefs.length;gi2++){
    var gd2=_D._groupDefs[gi2], nodes2=g[gd2.key], cnt2=nodes2.length;
    if(cnt2===0) continue;
    var aid='drillacc_'+gd2.key+'_'+projectId.replace(/[^a-zA-Z0-9_-]/g,'_');
    var isOpen=gd2.key==='delay';
    h+='<div class="drill-accordion"><div class="drill-acc-header" onclick="var b=document.getElementById(\''+aid+'\');var a=this.querySelector(\'.drill-acc-arrow\');if(b.style.display===\'none\'){b.style.display=\'block\';a.textContent=\'▲\'}else{b.style.display=\'none\';a.textContent=\'▼\'}" style="border-left-color:'+gd2.color+'">';
    h+='<span class="drill-acc-title">'+gd2.label+'（'+cnt2+'）</span>';
    if(gd2.tip) h+='<span class="drill-acc-hint">'+gd2.tip+'</span>';
    h+='<span class="drill-acc-arrow" style="margin-left:auto;font-size:11px;color:#8C8C9E">'+(isOpen?'▲':'▼')+'</span></div>';
    h+='<div id="'+aid+'" class="drill-acc-body" style="display:'+(isOpen?'block':'none')+'">';
    for(var ni=0;ni<nodes2.length;ni++){
      var n=nodes2[ni], color=_D._sc(n.nodeStatus), isPaid=pctToNum(n.actualPaymentRatio)!=null&&pctToNum(n.actualPaymentRatio)>=1;
      h+='<div class="drill-node-card" style="border-left:4px solid '+color+';'+(isPaid?'opacity:0.55;':'')+'">';
      h+=_D._renderNodeFull(n, ov, ns);
      h+='</div>';
    }
    h+='</div></div>';
  }
  h+='</div>';
  return h;
}

// ======== 入口 ========
function _renderFuDrillModal(projectId){
  _D._drillData = _fuDrillData(projectId);
  return _renderFuDrillModal_v3(projectId);
}

// ======== 下钻详情 — 弹出 Modal ========
window._fuDrillToNode = function(projectId, projectName){
  var ovProjs = (D.projectOverview && D.projectOverview.projects) ? D.projectOverview.projects : [];
  var pnTitle = projectName||projectId;
  for(var i=0;i<ovProjs.length;i++){ if(ovProjs[i].projectId===projectId){ pnTitle=ovProjs[i].projectName||pnTitle; break; } }
  var modal = document.getElementById('monthDetailModal');
  modal.innerHTML = '<div class="modal-mask" onclick="this.parentElement.innerHTML=\'\'"><div class="modal-box drill-modal-box" onclick="event.stopPropagation()">'+
    '<div class="modal-header"><span>下钻详情 — '+pnTitle.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span>'+
    '<span class="modal-close" onclick="this.closest(\'#monthDetailModal\').innerHTML=\'\'">&#10005;</span></div>'+
    '<div class="drill-modal-body">'+_renderFuDrillModal(projectId)+'</div></div></div>';
};
// Close node drill-down: directly restore expand panel
window._fuClearNodeDrill = function(){
  window._fuNodeDrillProject = null;
  var saved = window._fuSavedState;
  if(saved && saved.deptName){
    // Open panel first (overlay works from any page), then switch page underneath
    window._openFuExpand(saved.deptName, saved.timeWin||'');
    if(saved.fbFilter!=='all'){
      setTimeout(function(){
        var sel=document.getElementById('fuFbFilter');
        if(sel){sel.value=saved.fbFilter;window._renderFuRight(window._fuDeptName);}
      },150);
    }
  }
  nav('followup');
};

// Follow-up change handlers (use data-pid attribute)
window._fuChangeFlw = function(el){
  var pid=el.getAttribute('data-pid');
  var fu=_fuGet(pid);
  fu.flw=(el.value==='1');
  _fuSet(pid, fu);
  window._renderFuRight(window._fuDeptName);
};
window._fuChangeSt = function(el){
  var pid=el.getAttribute('data-pid');
  var fu=_fuGet(pid);
  fu.st=el.value;
  _fuSet(pid, fu);
  window._renderFuRight(window._fuDeptName);
};
window._fuChangeFb = function(el){
  var pid=el.getAttribute('data-pid');
  var fu=_fuGet(pid);
  fu.fb=el.value;
  _fuSet(pid, fu);
};

// 批量操作
window._fuBatchFlw = function(value){
  if(!value)return;var dn=window._fuDeptName;if(!dn)return;
  var projs=window._fuDeptProjects(dn);
  projs.forEach(function(p){var fu=_fuGet(p.projectId);fu.flw=(value==='1');_fuSet(p.projectId, fu);});
  window._renderFuRight(dn);
};
window._fuBatchSt = function(value){
  if(!value)return;var dn=window._fuDeptName;if(!dn)return;
  var projs=window._fuDeptProjects(dn);
  projs.forEach(function(p){var fu=_fuGet(p.projectId);fu.st=value;_fuSet(p.projectId, fu);});
  window._renderFuRight(dn);
};
})();
// V5.9 functions OUTSIDE IIFE — guaranteed globally accessible
try{initDash()}catch(e){console.error(e)};try{initData()}catch(e){console.error(e)};

// ============================================================
// 跟进记录模块 - 全局函数，供临期跟进展开面板调用
// ============================================================
(function(){
  // 跟进类型和状态选项
  var FU_TYPES = ['电话沟通','邮件推动','现场拜访','内部协调','合同确认','里程碑跟进','回款确认','其他'];
  var FU_STATUSES = ['跟进中','已解决','暂停跟进','需升级处理','已取消'];

  var baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
  // 获取跟进记录数据（从ANALYSIS_DATA或API）
  function _getFollowupRecords(projectId, callback){
    // 优先从ANALYSIS_DATA.rawNodes中读取（已同步的数据）
    if(window.ANALYSIS_DATA && window.ANALYSIS_DATA.rawNodes){
      var node = window.ANALYSIS_DATA.rawNodes.find(function(n){return n.projectId===projectId});
      if(node && node.followupRecords && node.followupRecords.length > 0){
        callback(node.followupRecords);
        return;
      }
    }
    // 其次从API获取（本地暂存的新记录）
    var baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
    fetch(baseUrl+'/api/followup/list/'+projectId+'?limit=5')
      .then(function(r){return r.json()})
      .then(function(d){
        if(d.success) callback(d.records);
        else callback([]);
      })
      .catch(function(){callback([])});
  }

  // 获取跟进类型和状态选项
  function _getFollowupOptions(callback){
    var baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
    fetch(baseUrl+'/api/followup/types')
      .then(function(r){return r.json()})
      .then(function(d){
        if(d.success){
          FU_TYPES = d['跟进类型'] || FU_TYPES;
          FU_STATUSES = d['跟进状态'] || FU_STATUSES;
        }
        callback(FU_TYPES, FU_STATUSES);
      })
      .catch(function(){callback(FU_TYPES, FU_STATUSES)});
  }

  // 渲染跟进记录区域HTML
  window._renderFollowupSection = function(projectId, projectName, nextActionDate){
    var containerId = 'fu-records-'+projectId;
    // 头行：左侧标题 + 右侧按钮区
    var html = '<div id="'+containerId+'" class="fu-records-section">';
    html += '<div class="fu-records-header" style="display:flex;justify-content:space-between;align-items:center;font-size:11px">';
    html += '<span style="font-weight:700;color:#1A1A2E">跟进记录</span>';
    html += '<div style="display:flex;align-items:center;gap:6px">';
    html += '<span id="'+containerId+'-histlabel" style="font-size:10px;color:#8C8C9E;display:none">历史:</span>';
    html += '<div id="'+containerId+'-history" style="display:flex;flex-wrap:wrap;gap:4px"></div>';
    html += '<button class="btn btn-primary btn-sm" id="'+containerId+'-addbtn" onclick="window._toggleFollowupForm(\''+projectId+'\')">+ 添加</button>';
    html += '</div></div>';
    // 展开的历史记录详情区
    html += '<div id="'+containerId+'-expanded" style="display:none;margin-bottom:8px;padding:10px 12px;background:#fff;border:2px solid #6366F1;border-radius:8px"></div>';
    // 最新跟进记录
    html += '<div class="fu-records-list" id="'+containerId+'-list"></div>';
    // 表单
    html += '<div class="fu-records-form" id="'+containerId+'-form" style="display:none">';
    html += '<div class="fu-form-title">添加跟进记录</div>';
    html += '<div class="fu-form-row fu-form-row-readonly"><label>记录编号</label><input type="text" id="'+containerId+'-recordId" value="保存后自动生成" readonly style="color:#8C8C9E;background:#F5F5F4;cursor:default"></div>';
    html += '<div class="fu-form-row fu-form-row-readonly"><label>项目编号</label><input type="text" id="'+containerId+'-projectId" value="'+projectId+'" readonly style="background:#F5F5F4;cursor:default"></div>';
    var pnSafe = (projectName||'').replace(/"/g,'"').replace(/</g,'<');
    html += '<div class="fu-form-row fu-form-row-readonly"><label>项目名称</label><input type="text" id="'+containerId+'-projectName" value="'+pnSafe+'" readonly style="background:#F5F5F4;cursor:default"></div>';
    html += '<div class="fu-form-row"><label>跟进类型</label><select id="'+containerId+'-type">';
    FU_TYPES.forEach(function(t){html+='<option value="'+t+'">'+t+'</option>';});
    html += '</select></div>';
    html += '<div class="fu-form-row"><label>跟进人</label><input type="text" id="'+containerId+'-person" placeholder="请输入姓名" maxlength="20"></div>';
    html += '<div class="fu-form-row"><label>跟进内容</label><textarea id="'+containerId+'-content" rows="3" maxlength="500" placeholder="请输入跟进内容（最多500字）"></textarea></div>';
    html += '<div class="fu-form-row"><label>跟进状态</label><select id="'+containerId+'-status">';
    FU_STATUSES.forEach(function(s){html+='<option value="'+s+'">'+s+'</option>';});
    html += '</select></div>';
    html += '<div class="fu-form-row"><label>下次跟进日期</label><input type="date" id="'+containerId+'-nextdate" value="'+(nextActionDate||'')+'" style="flex:none;width:auto;min-width:140px"></div>';
    html += '<div class="fu-form-hint">下次跟进日期默认为节点动作完成时间，动作完成时间到达后，跟进状态将自动重置</div>';
    html += '<div class="fu-form-actions"><button class="btn btn-primary btn-sm" onclick="window._submitFollowupRecord(\''+projectId+'\',\''+projectName+'\')">保存</button><button class="btn btn-outline btn-sm" onclick="window._toggleFollowupForm(\''+projectId+'\')">取消</button></div>';
    html += '</div>';
    html += '</div>';
    return html;
  };

  // 渲染单条跟进记录的详细HTML（hideActions=true时隐藏编辑/删除按钮，用于展开框）
  function _renderOneRecord(r, projectId, hideActions){
    var timeStr = r['跟进时间'] ? r['跟进时间'].substring(0,16) : '';
    var person = r['跟进人'] || '';
    var type = r['跟进类型'] || '';
    var content = r['跟进内容'] || '';
    var nextDate = r['下次跟进计划日期'] || '';
    var status = r['跟进状态'] || '';
    var isSystem = person === '系统';
    var recordId = r['记录编号'] || '';
    var h = '<div class="fu-record-item'+(isSystem?' fu-record-system':'')+'">';
    h += '<div class="fu-record-meta"><span class="fu-record-time">'+timeStr+'</span><span class="fu-record-person">'+person+'</span><span class="fu-record-type">'+type+'</span></div>';
    h += '<div class="fu-record-content">'+content+'</div>';
    h += '<div class="fu-record-footer"><span class="fu-record-status">'+status+'</span>';
    if(nextDate) h += '<span class="fu-record-next">下次: '+nextDate+'</span>';
    if(!hideActions && recordId && !isSystem) h += '<button class="fu-record-edit-btn" onclick="window._editFollowupRecord(\''+recordId+'\',\''+projectId+'\')" title="编辑">&#9998;</button>';
    if(!hideActions && recordId && !isSystem) h += '<button class="fu-record-delete-btn" onclick="window._deleteFollowupRecord(\''+recordId+'\',\''+projectId+'\')" title="删除">✕</button>';
    h += '</div></div>';
    return h;
  }

  // 加载并渲染跟进记录列表（最新记录展示详情，历史记录显示为时间戳按钮）
  window._loadFollowupRecords = function(projectId){
    var containerId = 'fu-records-'+projectId;
    var sectionEl = document.getElementById(containerId);
    var listEl = document.getElementById(containerId+'-list');
    var historyEl = document.getElementById(containerId+'-history');
    if(!listEl) return;
    _getFollowupRecords(projectId, function(records){
      if(!records || records.length === 0){
        // 无记录时：隐藏列表和历史按钮，仅保留头行"+ 添加"
        listEl.innerHTML = '';
        if(historyEl) historyEl.innerHTML = '';
        var histLabel = document.getElementById(containerId+'-histlabel');
        if(histLabel) histLabel.style.display = 'none';
        var badgeEl = document.getElementById('fubadge_'+projectId.replace(/[^a-zA-Z0-9_-]/g,'_'));
        if(badgeEl) badgeEl.style.display = 'none';
        return;
      }
      // 按跟进时间倒序（最新在前）
      records.sort(function(a,b){ return (b['跟进时间']||'').localeCompare(a['跟进时间']||''); });
      // 右下角蓝色三角角标（显示跟进记录数）
      var badgeEl = document.getElementById('fubadge_'+projectId.replace(/[^a-zA-Z0-9_-]/g,'_'));
      if(badgeEl){ badgeEl.style.display='flex'; var badgeSpan=badgeEl.querySelector('span'); if(badgeSpan) badgeSpan.textContent=records.length; }
      // 最新一条展示详情（隐藏内联按钮，改用右下角统一按钮）
      var latestRec = records[0];
      var latestId = latestRec['记录编号']||'';
      listEl.innerHTML = _renderOneRecord(latestRec, projectId, true)
        + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid #E2E0DC">'
        + '<button class="btn btn-outline btn-sm" style="color:#6366F1;border-color:#6366F1" onclick="window._editFollowupRecord(\''+latestId+'\',\''+projectId+'\')">编辑</button>'
        + '<button class="btn btn-outline btn-sm" style="color:#EF4444;border-color:#EF4444" onclick="window._deleteFollowupRecord(\''+latestId+'\',\''+projectId+'\')">删除</button>'
        + '</div>';
      // 其余记录显示为时间戳按钮（倒序，最新的最靠近添加按钮）
      if(historyEl && records.length > 1){
        var btnHtml = '';
        for(var i = 1; i < records.length; i++){
          var r = records[i];
          var ts = (r['跟进时间']||'').substring(0,16);
          var idx = i;
          btnHtml += '<button class="btn btn-outline btn-sm" style="color:#6366F1;border-color:#6366F1" onclick="window._fuExpandHistory(\''+projectId+'\','+idx+')" title="点击查看详情">'+ts+'</button>';
        }
        // 存储记录数据到全局以便展开
        window._fuHistoryCache = window._fuHistoryCache || {};
        window._fuHistoryCache[projectId] = records;
        historyEl.innerHTML = btnHtml;
        var histLabel = document.getElementById(containerId+'-histlabel');
        if(histLabel) histLabel.style.display = 'inline';
      } else if(historyEl){
        historyEl.innerHTML = '';
        var histLabel = document.getElementById(containerId+'-histlabel');
        if(histLabel) histLabel.style.display = 'none';
      }
    });
  };

  // 点击历史时间戳按钮，展开记录详情到列表上方
  window._fuExpandHistory = function(projectId, index){
    var containerId = 'fu-records-'+projectId;
    var expandedEl = document.getElementById(containerId+'-expanded');
    var historyEl = document.getElementById(containerId+'-history');
    if(!expandedEl) return;
    var records = (window._fuHistoryCache||{})[projectId];
    if(!records || index >= records.length) return;
    // Toggle: 同一条记录再次点击则收起
    if(expandedEl.style.display === 'block' && expandedEl.getAttribute('data-idx') === String(index)){
      expandedEl.style.display = 'none';
      // 清除所有按钮激活状态
      if(historyEl){ var btns=historyEl.querySelectorAll('button'); for(var i=0;i<btns.length;i++){ btns[i].style.background=''; btns[i].style.color='#6366F1'; btns[i].style.borderColor='#6366F1'; } }
      return;
    }
    // 高亮当前按钮，重置其他按钮
    if(historyEl){
      var btns=historyEl.querySelectorAll('button');
      for(var i=0;i<btns.length;i++){
        if(i === index-1){ btns[i].style.background='#6366F1'; btns[i].style.color='#fff'; btns[i].style.borderColor='#6366F1'; }
        else{ btns[i].style.background=''; btns[i].style.color='#6366F1'; btns[i].style.borderColor='#6366F1'; }
      }
    }
    var recId = records[index]['记录编号'] || '';
    expandedEl.innerHTML = '<div style="font-size:11px;font-weight:700;color:#6366F1;margin-bottom:6px">历史记录详情</div>'
      + _renderOneRecord(records[index], projectId, true)
      + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;padding-top:6px;border-top:1px solid #E2E0DC">'
      + '<button class="btn btn-outline btn-sm" style="color:#6366F1;border-color:#6366F1" onclick="window._editFollowupRecord(\''+recId+'\',\''+projectId+'\')">编辑</button>'
      + '<button class="btn btn-outline btn-sm" style="color:#EF4444;border-color:#EF4444" onclick="var e=document.getElementById(\''+containerId+'-expanded\');e.style.display=\'none\';var h=document.getElementById(\''+containerId+'-history\');if(h){var b=h.querySelectorAll(\'button\');for(var i=0;i<b.length;i++){b[i].style.background=\'\';b[i].style.color=\'#6366F1\';b[i].style.borderColor=\'#6366F1\'}};window._deleteFollowupRecord(\''+recId+'\',\''+projectId+'\')">删除</button>'
      + '</div>';
    expandedEl.style.display = 'block';
    expandedEl.setAttribute('data-idx', String(index));
    expandedEl.scrollIntoView({behavior:'smooth',block:'center'});
  };

  // 显示/隐藏跟进记录表单
  window._toggleFollowupForm = function(projectId){
    var containerId = 'fu-records-'+projectId;
    var formEl = document.getElementById(containerId+'-form');
    var addBtn = document.getElementById(containerId+'-addbtn');
    if(!formEl) return;
    if(formEl.style.display === 'none'){
      formEl.style.display = 'block';
      if(addBtn) addBtn.style.display = 'none';
    } else {
      formEl.style.display = 'none';
      if(addBtn) addBtn.style.display = 'inline-flex';
      // 清空表单
      var typeEl = document.getElementById(containerId+'-type');
      var personEl = document.getElementById(containerId+'-person');
      var contentEl = document.getElementById(containerId+'-content');
      var statusEl = document.getElementById(containerId+'-status');
      if(typeEl) typeEl.value = FU_TYPES[0];
      if(personEl) personEl.value = '';
      if(contentEl) contentEl.value = '';
      if(statusEl) statusEl.value = FU_STATUSES[0];
    }
  };

  // 提交跟进记录
  window._submitFollowupRecord = function(projectId, projectName){
    var containerId = 'fu-records-'+projectId;
    var typeEl = document.getElementById(containerId+'-type');
    var personEl = document.getElementById(containerId+'-person');
    var contentEl = document.getElementById(containerId+'-content');
    var statusEl = document.getElementById(containerId+'-status');
    var nextdateEl = document.getElementById(containerId+'-nextdate');

    var data = {
      '项目编号': projectId,
      '项目名称': projectName,
      '跟进人': personEl ? personEl.value.trim() : '',
      '跟进类型': typeEl ? typeEl.value : '',
      '跟进内容': contentEl ? contentEl.value.trim() : '',
      '跟进状态': statusEl ? statusEl.value : '',
      '下次跟进计划日期': nextdateEl ? nextdateEl.value : ''
    };

    // 传递云文档URL（从数据管理页面的数据源地址输入框读取）
    var _urlInput = document.getElementById('syncUrl');
    if(_urlInput && _urlInput.value.trim()){
      data['cloudUrl'] = _urlInput.value.trim();
    }

    // 前端校验
    if(!data['跟进人']){
      alert('请填写跟进人姓名');
      if(personEl) personEl.focus();
      return;
    }
    if(!data['跟进内容']){
      alert('请填写跟进内容');
      if(contentEl) contentEl.focus();
      return;
    }
    if(data['跟进内容'].length > 500){
      alert('跟进内容不能超过500字');
      return;
    }

    // 提交到API（编辑模式调用update，新增模式调用add）
    var baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
    var isEdit = !!(window._fuEditRecordId);
    var apiPath = isEdit ? '/api/followup/update' : '/api/followup/add';
    if(isEdit){ data['记录编号'] = window._fuEditRecordId; }
    fetch(baseUrl+apiPath, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    })
    .then(function(r){return r.json()})
    .then(function(result){
      if(result.success){
        // 清除编辑模式
        window._fuEditRecordId = null; window._fuEditProjectId = null;
        // 隐藏表单
        window._toggleFollowupForm(projectId);
        // 刷新跟进记录列表
        window._loadFollowupRecords(projectId);
        // 显示云同步进度toast
        var recordId = result['记录编号'] || (isEdit ? data['记录编号'] : '');
        var isCloudSync = result.message && (result.message.indexOf('正在同步') !== -1 || result.message.indexOf('正在重新同步') !== -1);
        if(isCloudSync && recordId){
          window._showFollowupSyncToast(recordId, projectId);
        } else {
          // 仅本地保存，短暂提示
          window._showFollowupSyncToast(recordId, projectId, true);
        }
      } else {
        alert(result.message);
      }
    })
    .catch(function(e){
      alert('保存失败: '+e.message);
    });
  };

  // ── 编辑跟进记录 ──
  window._editFollowupRecord = function(recordId, projectId){
    if(!recordId){
      alert('记录编号无效，无法编辑');
      return;
    }
    // 从服务器获取跟进记录详情
    var baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
    fetch(baseUrl+'/api/followup/list/'+projectId+'?limit=20')
      .then(function(r){return r.json()})
      .then(function(result){
        if(!result.success){alert('获取跟进记录失败');return;}
        // 找到对应记录
        var record=null;
        if(result.records){
          for(var i=0;i<result.records.length;i++){
            if(result.records[i]['记录编号']===recordId){record=result.records[i];break;}
          }
        }
        if(!record){alert('未找到跟进记录: '+recordId);return;}

        // 打开表单
        var containerId='fu-records-'+projectId;
        window._toggleFollowupForm(projectId);

        // 填充表单字段
        var typeEl=document.getElementById(containerId+'-type');
        var personEl=document.getElementById(containerId+'-person');
        var contentEl=document.getElementById(containerId+'-content');
        var statusEl=document.getElementById(containerId+'-status');
        var nextdateEl=document.getElementById(containerId+'-nextdate');
        var recordIdEl=document.getElementById(containerId+'-recordId');

        if(typeEl)typeEl.value=record['跟进类型']||'';
        if(personEl)personEl.value=record['跟进人']||'';
        if(contentEl)contentEl.value=record['跟进内容']||'';
        if(statusEl)statusEl.value=record['跟进状态']||'';
        if(nextdateEl)nextdateEl.value=record['下次跟进计划日期']||'';
        if(recordIdEl){recordIdEl.value=recordId;recordIdEl.readOnly=true;}

        // 更新表单标题
        var formTitle=document.getElementById(containerId+'-form');
        if(formTitle){
          var titleEl=formTitle.querySelector('.fu-form-title');
          if(titleEl)titleEl.textContent='编辑跟进记录 ('+recordId+')';
        }

        // 更新保存按钮为更新操作
        var saveBtn=formTitle?formTitle.querySelector('.fu-form-actions .btn-primary'):null;
        // 将提交函数标记为编辑模式
        window._fuEditRecordId=recordId;
        window._fuEditProjectId=projectId;
      })
      .catch(function(e){
        alert('获取跟进记录失败: '+e.message);
      });
  };

  // ── 删除跟进记录 ──
  window._deleteFollowupRecord = function(recordId, projectId){
    if(!recordId){
      alert('记录编号无效，无法删除');
      return;
    }
    if(!confirm('确定要删除此跟进记录吗？\n\n记录编号: '+recordId+'\n删除后无法恢复。')){
      return;
    }
    var baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
    var delData = {'记录编号': recordId};
    var _urlInput = document.getElementById('syncUrl');
    if(_urlInput && _urlInput.value.trim()){ delData['cloudUrl'] = _urlInput.value.trim(); }
    fetch(baseUrl+'/api/followup/delete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(delData)
    })
    .then(function(r){return r.json()})
    .then(function(result){
      if(result.success){
        // 同步更新内存数据，避免刷新时显示已删除记录
        if(window.ANALYSIS_DATA && window.ANALYSIS_DATA.rawNodes){
          var node = window.ANALYSIS_DATA.rawNodes.find(function(n){return n.projectId===projectId;});
          if(node && node.followupRecords){
            node.followupRecords = node.followupRecords.filter(function(r){return r['记录编号']!==recordId;});
          }
        }
        // 刷新跟进记录列表
        window._loadFollowupRecords(projectId);
        // 显示提示
        var isCloudDel = result.message && result.message.indexOf('正在同步') !== -1;
        window._showFollowupSyncToast(recordId, projectId, !isCloudDel);
      } else {
        alert('删除失败: '+(result.message||'未知错误'));
      }
    })
    .catch(function(e){
      alert('删除请求失败: '+e.message);
    });
  };

  // ── 跟进记录云同步进度Toast ──
  window._showFollowupSyncToast = function(recordId, projectId, localOnly){
    // 创建toast容器
    var toastId = 'fu-sync-toast-' + recordId;
    // 移除旧的toast（如有）
    var oldToast = document.getElementById(toastId);
    if(oldToast) oldToast.remove();

    var toast = document.createElement('div');
    toast.id = toastId;
    toast.className = 'fu-sync-toast';
    if(localOnly){
      toast.className = 'fu-sync-toast fu-sync-toast-local';
      toast.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;margin-right:8px;flex-shrink:0"></span><span>已保存到本地</span>';
    } else {
      toast.className = 'fu-sync-toast fu-sync-toast-syncing';
      toast.innerHTML = '<span class="spinning" style="display:inline-block;width:8px;height:8px;border:2px solid #E2E0DC;border-top-color:#6366F1;border-radius:50%;margin-right:8px;flex-shrink:0;animation:spin .8s linear infinite"></span><span id="'+toastId+'-msg">正在同步到云文档...</span>';
    }
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;align-items:center;padding:10px 16px;background:#fff;border:1px solid #E2E0DC;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);font-size:13px;color:#1A1A2E;max-width:360px;transition:all .3s ease';
    document.body.appendChild(toast);

    if(localOnly){
      setTimeout(function(){ if(toast.parentElement) toast.remove(); }, 4000);
      return;
    }

    // 云同步：开始轮询状态
    window._pollFollowupSyncStatus(recordId, toastId, projectId);
  };

  window._pollFollowupSyncStatus = function(recordId, toastId, projectId){
    var maxPolls = 60; // 最长轮询2分钟（每2秒一次）
    var pollCount = 0;
    var pollInterval = setInterval(function(){
      pollCount++;
      if(pollCount > maxPolls){
        clearInterval(pollInterval);
        // 超时：标记为未知状态
        var toast = document.getElementById(toastId);
        if(toast && toast.parentElement){
          toast.style.background = '#F8FAFC';
          if(msgEl) msgEl.textContent = '同步耗时较长，状态未知';
          setTimeout(function(){ if(toast.parentElement) toast.remove(); }, 8000);
        }
        return;
      }
      var baseUrl=location.protocol==='file:'?'http://localhost:8080':'';
      fetch(baseUrl+'/api/followup/sync-status?recordId='+encodeURIComponent(recordId))
        .then(function(r){return r.json()})
        .then(function(result){
          if(!result.success) return;
          var state = result.state || {};
          var toast = document.getElementById(toastId);
          if(!toast || !toast.parentElement){
            clearInterval(pollInterval);
            return;
          }
          var msgEl = document.getElementById(toastId+'-msg');
          if(state.status === 'syncing'){
            // 仍在同步中，更新消息
            if(msgEl) msgEl.textContent = state.message || '同步中...';
          } else if(state.status === 'success'){
            clearInterval(pollInterval);
            if(msgEl){ msgEl.textContent = '已同步到云文档'; msgEl.style.color = '#10B981'; }
            setTimeout(function(){ if(toast.parentElement) toast.remove(); }, 5000);
          } else if(state.status === 'failed'){
            clearInterval(pollInterval);
            if(msgEl){ msgEl.textContent = '同步失败'; msgEl.style.color = '#EF4444'; }
            setTimeout(function(){ if(toast.parentElement) toast.remove(); }, 8000);
          }
        })
        .catch(function(){
          // 网络错误，继续轮询
        });
    }, 2000);
  };
})();
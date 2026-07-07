// ================================================================
// 云端配置区：如果要脱离 Claude、部署到 GitHub Pages 等外部网站，
// 需要在这里填入你自己的 Firebase 配置（免费）。
// 不填也没关系——放在 Claude 里打开时，会自动改用 Claude 自带的云存储。
// 获取方式：打开 https://console.firebase.google.com
// ================================================================
const firebaseConfig = {
  apiKey: "AIzaSyD7puv-o7__eL6vqIdIFVZV6quoJvAhxZY",
  authDomain: "question-bank-188.firebaseapp.com",
  databaseURL: "https://question-bank-188-default-rtdb.firebaseio.com",
  projectId: "question-bank-188",
  storageBucket: "question-bank-188.firebasestorage.app",
  messagingSenderId: "646415175650",
  appId: "1:646415175650:web:05463989f6c28427d5b3bb"
};

let cloudMode = "none"; // "firebase" | "claude" | "none"
const syncPromises = []; // 收集所有初次同步任务，全部完成后隐藏顶部同步提示条
let db, dbRef, dbPush, dbOnValue;
// ======== 为修改和删除提供 firebase 支持的引用 ========
let dbUpdate, dbRemove, dbSet;

if(firebaseConfig.apiKey){
  try{
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const mod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
    dbRef = mod.ref; dbPush = mod.push; dbOnValue = mod.onValue;
    dbUpdate = mod.update; dbRemove = mod.remove; dbSet = mod.set;
    const app = initializeApp(firebaseConfig);
    db = mod.getDatabase(app);
    cloudMode = "firebase";
  }catch(e){
    console.warn("Firebase 初始化失败，将尝试 Claude 云存储", e);
  }
}
if(cloudMode==="none" && typeof window.storage !== "undefined"){
  cloudMode = "claude";
}

// ------------------ 数据 ------------------
const builtinCategories = [
  {key:"all", label:"全部", icon:"✨"},
  {key:"info", label:"信息素", icon:"🧬"},
  {key:"meet", label:"初遇", icon:"💫"},
  {key:"job", label:"职业", icon:"💼"},
  {key:"pet", label:"宠物", icon:"🐾"},
  {key:"work", label:"作品设定", icon:"📚"},
  {key:"order", label:"188顺序", icon:"🔢"},
  {key:"rel", label:"关系", icon:"💞"},
  {key:"sport", label:"运动项目", icon:"🏅"},
  {key:"misc", label:"其他", icon:"🗂️"},
];
let categoryOverrides = {};   // 内置分类的修改/删除记录，key为内置分类key
let customCategories = [];    // 用户新建的分类
let categories = [...builtinCategories];

// 大类分组
let groups = [];        // {key, label, icon, catKeys:[...], _cloudKey}
let openGroupKey = null; 

// 根据内置分类 + 覆盖记录 + 自定义分类，重新计算最终显示的分类列表
function computeCategories(){
  const overridden = builtinCategories
    .map(c=>{
      const ov = categoryOverrides[c.key];
      if(!ov) return c;
      if(ov.deleted) return null;
      return { ...c, label: ov.label || c.label, icon: ov.icon || c.icon };
    })
    .filter(Boolean);
  categories = [...overridden, ...customCategories];
}

let data = [
  {cat:"job", q:"李程秀与邵群初遇时，邵群的职业是什么？", a:"厨师", extra:"拓展方向：可整理各作品男主/男二初遇时的职业设定"},
  {cat:"info", q:"瞿末予的信息素是什么？", a:"黑檀木"},
  {cat:"info", q:"沈岱的信息素是什么？", a:"昙花", extra:"性别拓展：沈 = Ω(o) 瞿 = α(a)"},
  {cat:"misc", q:"原炀的父亲是谁？", a:"原立江", extra:"拓展方向：待补充（父辈角色设定还可以怎么深挖？）"},
  {cat:"work", q:"顾青裴是哪里人？", a:"成都人", extra:"拓展方向：各作品角色的出生地 / 最初闯荡的城市 / 最终定居地 / 故事发生地，可以做成一张对照表"},
  {cat:"job", q:"《全球实况》男主是谁？", a:"陆澜起", extra:"代号：天蝎 · 曾潜入综艺《一千零一种死亡》卧底"},
  {cat:"pet", q:"龙血/养父设定中，捡到的小龙人艾尔头发是什么颜色？", a:"金色"},
  {cat:"meet", q:"丁小伟与周谨行的初遇地点是？", a:"海边（晚上）"},
  {cat:"meet", q:"黎朔与赵锦辛的初遇地点是？", a:"飞机上", extra:"拓展方向：整理各作品CP的初遇地点合集"},
  {cat:"pet", q:"李程秀的狗是什么颜色？", a:"巧克力色"},
  {cat:"work", q:"《爱何辜》是为谁创作的？", a:"何故"},
  {cat:"work", q:"《爱何辜》出现在哪部作品里？", a:"《一醉经年》"},
  {cat:"job", q:"何故的职业似乎是？", a:"建筑师？", extra:"存疑：印象中在《火焰戎装》里出现过，需要再核实"},
  {cat:"job", q:"小说里谁是歌手？", a:"宋居寒"},
  {cat:"job", q:"周翔最开始的职业是什么？", a:"武打替身", extra:"拓展方向：整理各角色最初的职业设定合集"},
  {cat:"job", q:"晏明修的职业是什么？", a:"演员"},
  {cat:"job", q:"宋居寒的职业是什么？", a:"歌手", extra:"注意：题目若问“职业是歌手的是谁”，答案就是宋居寒"},
  {cat:"rel", q:"《火焰戎装》里的定情信物是什么？", a:"一心一蝎", extra:"拓展方向：整理各作品定情信物 / 确认关系的关键节点"},
  {cat:"misc", q:"《附加遗产》开篇时，洛羿的交通工具是什么？", a:"自行车"},
  {cat:"work", q:"《顶级掠食者》里瞿末予的公司主要经营什么？", a:"稀土"},
  {cat:"order", q:"《火焰戎装》是188系列的第几部？", a:"第10部", extra:"拓展方向：完整梳理全部作品的创作顺序（见下方“188顺序”分类）"},
  {cat:"work", q:"《逐王》是谁的作品？", a:"水千丞", extra:"拓展方向：整理水千丞的其他作品清单"},
  {cat:"pet", q:"水千丞的第一只猫叫什么？", a:"阿布（不太确定，待补充确认）"},
  {cat:"order", q:"188系列目前一共有几对主CP？", a:"11对"},
  {cat:"order", q:"按创作顺序，188系列最后一部作品是？", a:"《顶级掠食者》"},
  {cat:"pet", q:"李程秀的狗叫什么名字？", a:"茶杯", extra:"颜色：巧克力色 · 品种：茶杯犬"},
  {cat:"job", q:"188团长是谁？", a:"邵群"},
  {cat:"job", q:"188副团长是谁？", a:"宋居寒"},
  {cat:"rel", q:"简隋英的表弟是谁？", a:"白新羽"},
  {cat:"misc", q:"这次漫展的主题是什么？", a:"临界心率", extra:"（视具体情况可能调整）"},
  {cat:"misc", q:"李玉第一次请简隋英吃的东西是什么？", a:"麻辣烫"},
  {cat:"rel", q:"简隋英与李玉最开始的关系是什么？", a:"弟弟的同学", extra:"拓展方向：整理188各作品角色之间“最初关系”的设定合集"},
  {cat:"rel", q:"李玉最开始喜欢的人是谁？", a:"简隋林（好像？）", extra:"存疑，需要再确认"},
  {cat:"job", q:"龙血/养父设定中，单鸣的职业是什么？", a:"雇佣兵 / 特种兵"},
  {cat:"pet", q:"《寒武再临》里的布偶猫叫什么？", a:"阿布（？）", extra:"存疑，需要再确认"},
  {cat:"rel", q:"俞风城跟白新羽最虐的桥段发生在哪里？", a:"昆仑山"},
];

const workOrder = [
  "《娘娘腔》", "《老婆孩子热炕头》/《灰大叔与混血王子》", "《你却爱着一个他》/《你却爱着一个SB》",
  "《职业替身》", "《针锋对决》", "《小白杨》", "《附加遗产》", "《一醉经年》",
  "《谁把谁当真》", "《火焰戎装》", "《顶级掠食者》",
];
workOrder.forEach((name, i)=>{
  data.push({ cat:"order", q:`188系列第 ${i+1} 部作品是？`, a:name, extra: i===0 ? "共11部，此为完整创作顺序清单" : undefined });
});

const sports = [
  ["群秀","滑雪"],["周丁","篮球"],["李简","射箭"],["晏周","综合格斗"],
  ["原顾","射击"],["俞白","棒球"],["洛温","滑板"],["寒故","花样滑冰"],
  ["妹叔","赛车"],["宫任","网球"],["瞿沈","冲浪"],
];
sports.forEach(([who, sport])=>{
  data.push({cat:"sport", q:`${who} 对应的运动项目是？`, a:sport});
});

// ------------------ 渲染逻辑 ------------------
let cloudEntries = [];
function getAllData(){ 
  let combined = data.concat(cloudEntries); 
  combined.forEach((item, idx) => item._globalIndex = idx);
  return combined;
}

const feed = document.getElementById("feed");
const storyBar = document.getElementById("storyBar");
const groupBar = document.getElementById("groupBar");
const groupDrawer = document.getElementById("groupDrawer");
const resultBar = document.getElementById("resultBar");
const searchInput = document.getElementById("searchInput");
const clearBtn = document.getElementById("clearBtn");

let activeCat = "all";
let keyword = "";
let isGraphMode = false;
let isDocMode = false; // 新增：记录当前是否处于文档模式

function catInfo(key){
  return categories.find(c=>c.key===key) || categories[categories.length-1];
}

function renderStories(){
  storyBar.innerHTML = categories.map(c=>{
    const activeClass = c.key===activeCat ? "active" : "";
    return `<div class="tab ${activeClass}" data-cat="${c.key}">${c.icon} ${c.label}</div>`;
  }).join("") + `<div class="tab tab-add" id="addCatTab">＋ 新增分类</div>`;

  storyBar.querySelectorAll(".tab[data-cat]").forEach(el=>{
    let pressTimer = null;
    let longPressed = false;
    const startPress = ()=>{ longPressed = false; pressTimer = setTimeout(()=>{ longPressed = true; handleLongPressCategory(el.dataset.cat); }, 600); };
    const cancelPress = ()=>{ clearTimeout(pressTimer); };
    el.addEventListener("mousedown", startPress);
    el.addEventListener("touchstart", startPress, {passive:true});
    el.addEventListener("mouseup", cancelPress);
    el.addEventListener("mouseleave", cancelPress);
    el.addEventListener("touchend", cancelPress);
    el.addEventListener("touchmove", cancelPress);
    el.addEventListener("click", ()=>{
      if(longPressed){ longPressed = false; return; }
      activeCat = el.dataset.cat;
      renderStories();
      render(true);
    });
  });

  const addTab = document.getElementById("addCatTab");
  if(addTab) addTab.addEventListener("click", ()=>createNewCategory(false));
}

// 分类编辑/删除
async function handleLongPressCategory(catKey){
  if(catKey === "all"){ alert("「全部」是固定标签，不能修改"); return; }
  const cat = categories.find(c=>c.key===catKey);
  if(!cat) return;
  const isBuiltin = builtinCategories.some(c=>c.key===catKey);

  const action = prompt(`分类「${cat.icon} ${cat.label}」\n输入 1 = 编辑\n输入 2 = 删除\n其他 = 取消`, "1");
  if(action === "1"){
    const icon = prompt("新的图标：", cat.icon);
    if(icon===null) return;
    const label = prompt("新的名称：", cat.label);
    if(!label) return;
    await saveCategoryEdit(catKey, isBuiltin, { label: label.trim(), icon: icon.trim() || cat.icon });
  }else if(action === "2"){
    const ok = confirm(`确定要删除分类「${cat.icon} ${cat.label}」吗？\n（该分类下已有的词条不会被删除，只是分类标签会消失）`);
    if(!ok) return;
    await saveCategoryDelete(catKey, isBuiltin);
  }
}

async function saveCategoryEdit(catKey, isBuiltin, newVal){
  try{
    if(isBuiltin){
      if(cloudMode==="firebase"){
        await dbSet(dbRef(db, "categoryOverrides/" + catKey), newVal);
      }else if(cloudMode==="claude"){
        await window.storage.set("categoryOverride:" + catKey, JSON.stringify(newVal), true);
        categoryOverrides[catKey] = newVal;
        computeCategories(); refreshCategoryUI();
      }else{
        categoryOverrides[catKey] = newVal;
        computeCategories(); refreshCategoryUI();
      }
    }else{
      const cat = categories.find(c=>c.key===catKey);
      if(cloudMode==="firebase" && cat._cloudKey){
        await dbUpdate(dbRef(db, "categories/" + cat._cloudKey), newVal);
      }else if(cloudMode==="claude" && cat._cloudKey){
        await window.storage.set(cat._cloudKey, JSON.stringify(newVal), true);
        Object.assign(cat, newVal);
        computeCategories(); refreshCategoryUI();
      }else{
        Object.assign(cat, newVal);
        computeCategories(); refreshCategoryUI();
      }
    }
    renderStories(); render(true);
  }catch(e){ alert("修改分类失败：" + e.message); }
}

async function saveCategoryDelete(catKey, isBuiltin){
  try{
    if(isBuiltin){
      const delVal = { deleted:true };
      if(cloudMode==="firebase"){
        await dbSet(dbRef(db, "categoryOverrides/" + catKey), delVal);
      }else if(cloudMode==="claude"){
        await window.storage.set("categoryOverride:" + catKey, JSON.stringify(delVal), true);
        categoryOverrides[catKey] = delVal;
        computeCategories(); refreshCategoryUI();
      }else{
        categoryOverrides[catKey] = delVal;
        computeCategories(); refreshCategoryUI();
      }
    }else{
      const cat = categories.find(c=>c.key===catKey);
      if(cloudMode==="firebase" && cat._cloudKey){
        await dbRemove(dbRef(db, "categories/" + cat._cloudKey));
      }else if(cloudMode==="claude" && cat._cloudKey){
        await window.storage.delete(cat._cloudKey, true);
        customCategories = customCategories.filter(c=>c.key!==catKey);
        computeCategories(); refreshCategoryUI();
      }else{
        customCategories = customCategories.filter(c=>c.key!==catKey);
        computeCategories(); refreshCategoryUI();
      }
    }
    if(activeCat===catKey){ activeCat = "all"; }
    renderStories(); render(true);
  }catch(e){ alert("删除分类失败：" + e.message); }
}

async function createNewCategory(fromSelect, assignGroupKey){
  const icon = prompt("新分类图标（输入一个emoji，例如📌）：", "📌");
  if(icon===null){ if(fromSelect) inCat.value = categories[1].key; return; }
  const label = prompt("新分类名称：", "");
  if(!label){ if(fromSelect) inCat.value = categories[1].key; return; }
  const newCat = { label: label.trim(), icon: icon.trim() || "📌" };
  try{
    let newKey = null;
    if(cloudMode==="firebase"){
      const newRef = dbPush(dbRef(db, "categories"), newCat);
      newKey = "c_" + newRef.key;
      if(fromSelect) setTimeout(()=>{ inCat.value = newKey; }, 300);
    }else if(cloudMode==="claude"){
      const key = "category:" + Date.now() + "_" + Math.random().toString(36).slice(2,7);
      await window.storage.set(key, JSON.stringify(newCat), true);
      newKey = "c_"+key;
      customCategories.push({ key:newKey, label:newCat.label, icon:newCat.icon, _cloudKey:key });
      computeCategories(); refreshCategoryUI();
      if(fromSelect) inCat.value = newKey;
    }else{
      newKey = "c_local_" + Date.now();
      customCategories.push({ key:newKey, label:newCat.label, icon:newCat.icon });
      computeCategories(); refreshCategoryUI();
      if(fromSelect) inCat.value = newKey;
    }
    if(assignGroupKey && newKey){
      setTimeout(()=> addCatKeyToGroup(assignGroupKey, newKey), cloudMode==="firebase" ? 350 : 0);
    }
  }catch(e){
    alert("新增分类失败：" + e.message);
    if(fromSelect) inCat.value = categories[1].key;
  }
}

function renderGroups(){
  groupBar.innerHTML = groups.map(g=>{
    const activeClass = g.key===openGroupKey ? "active" : "";
    return `<div class="bigtab ${activeClass}" data-group="${g.key}">${g.icon} ${g.label}</div>`;
  }).join("") + `<div class="bigtab bigtab-add" id="addGroupTab">＋ 新增大类</div>`;

  groupBar.querySelectorAll(".bigtab[data-group]").forEach(el=>{
    let pressTimer = null, longPressed = false;
    const startPress = ()=>{ longPressed=false; pressTimer=setTimeout(()=>{ longPressed=true; handleLongPressGroup(el.dataset.group); }, 600); };
    const cancelPress = ()=> clearTimeout(pressTimer);
    el.addEventListener("mousedown", startPress);
    el.addEventListener("touchstart", startPress, {passive:true});
    el.addEventListener("mouseup", cancelPress);
    el.addEventListener("mouseleave", cancelPress);
    el.addEventListener("touchend", cancelPress);
    el.addEventListener("touchmove", cancelPress);
    el.addEventListener("click", ()=>{
      if(longPressed){ longPressed=false; return; }
      openGroupKey = (openGroupKey===el.dataset.group) ? null : el.dataset.group;
      renderGroups();
      renderDrawer();
    });
  });

  const addGroupTab = document.getElementById("addGroupTab");
  if(addGroupTab) addGroupTab.addEventListener("click", createNewGroup);
}

function renderDrawer(){
  if(!openGroupKey){ groupDrawer.style.display="none"; groupDrawer.innerHTML=""; return; }
  const g = groups.find(x=>x.key===openGroupKey);
  if(!g){ groupDrawer.style.display="none"; return; }

  groupDrawer.style.display = "flex";
  const childCats = (g.catKeys||[]).map(k=>categories.find(c=>c.key===k)).filter(Boolean);

  groupDrawer.innerHTML = (childCats.length
    ? childCats.map(c=>{
        const activeClass = c.key===activeCat ? "active" : "";
        return `<div class="tab drawer-tab ${activeClass}" data-cat="${c.key}">${c.icon} ${c.label}</div>`;
      }).join("")
    : `<span style="font-size:12px;color:var(--sub);">这个大类下还没有小类，点右边加一个吧</span>`
  ) + `<div class="tab tab-add drawer-tab" id="addChildTab">＋ 添加小类</div>`;

  groupDrawer.querySelectorAll(".drawer-tab[data-cat]").forEach(el=>{
    let pressTimer = null, longPressed = false;
    const startPress = ()=>{ longPressed=false; pressTimer=setTimeout(()=>{ longPressed=true; handleLongPressCategory(el.dataset.cat); }, 600); };
    const cancelPress = ()=> clearTimeout(pressTimer);
    el.addEventListener("mousedown", startPress);
    el.addEventListener("touchstart", startPress, {passive:true});
    el.addEventListener("mouseup", cancelPress);
    el.addEventListener("mouseleave", cancelPress);
    el.addEventListener("touchend", cancelPress);
    el.addEventListener("touchmove", cancelPress);
    el.addEventListener("click", ()=>{
      if(longPressed){ longPressed=false; return; }
      activeCat = el.dataset.cat;
      renderStories();
      renderDrawer();
      render(true);
    });
  });

  const addChildTab = document.getElementById("addChildTab");
  if(addChildTab) addChildTab.addEventListener("click", ()=>addCategoryToGroup(openGroupKey));
}

function addCategoryToGroup(groupKey){
  const g = groups.find(x=>x.key===groupKey);
  if(!g) return;
  const available = categories.filter(c=>c.key!=="all" && !(g.catKeys||[]).includes(c.key));
  const listStr = available.map((c,i)=>`${i+1}. ${c.icon} ${c.label}`).join("\n");
  const input = prompt(`把哪个小类加入「${g.label}」？\n输入编号选择已有的：\n${listStr}\n\n或输入 new 新建一个小类`, "new");
  if(input===null) return;
  if(input.trim()==="new"){ createNewCategory(false, groupKey); return; }
  const idx = parseInt(input.trim()) - 1;
  const picked = available[idx];
  if(!picked){ alert("没找到这个编号"); return; }
  addCatKeyToGroup(groupKey, picked.key);
}

function addCatKeyToGroup(groupKey, catKey){
  const g = groups.find(x=>x.key===groupKey);
  if(!g) return;
  if(!g.catKeys) g.catKeys = [];
  if(!g.catKeys.includes(catKey)) g.catKeys.push(catKey);
  saveGroupCatKeys(g);
}

async function saveGroupCatKeys(g){
  try{
    if(cloudMode==="firebase" && g._cloudKey){
      await dbUpdate(dbRef(db, "groups/" + g._cloudKey), { catKeys: g.catKeys });
    }else if(cloudMode==="claude" && g._cloudKey){
      await window.storage.set(g._cloudKey, JSON.stringify({ label:g.label, icon:g.icon, catKeys:g.catKeys }), true);
    }
  }catch(e){ console.error("保存大类失败", e); }
  renderDrawer();
}

async function createNewGroup(){
  const icon = prompt("大类图标（输入一个emoji，例如📁）：", "📁");
  if(icon===null) return;
  const label = prompt("大类名称：", "");
  if(!label) return;
  const newGroup = { label: label.trim(), icon: icon.trim() || "📁", catKeys: [] };
  try{
    if(cloudMode==="firebase"){
      dbPush(dbRef(db, "groups"), newGroup);
    }else if(cloudMode==="claude"){
      const key = "group:" + Date.now() + "_" + Math.random().toString(36).slice(2,7);
      await window.storage.set(key, JSON.stringify(newGroup), true);
      groups.push({ key:"g_"+key, ...newGroup, _cloudKey:key });
      renderGroups();
    }else{
      const localKey = "g_local_" + Date.now();
      groups.push({ key:localKey, ...newGroup });
      renderGroups();
    }
  }catch(e){ alert("新增大类失败：" + e.message); }
}

async function handleLongPressGroup(groupKey){
  const g = groups.find(x=>x.key===groupKey);
  if(!g) return;
  const action = prompt(`大类「${g.icon} ${g.label}」\n输入 1 = 编辑\n输入 2 = 删除（不会删除里面的小类词条）\n其他 = 取消`, "1");
  if(action==="1"){
    const icon = prompt("新的图标：", g.icon);
    if(icon===null) return;
    const label = prompt("新的名称：", g.label);
    if(!label) return;
    g.icon = icon.trim() || g.icon;
    g.label = label.trim();
    try{
      if(cloudMode==="firebase" && g._cloudKey){
        await dbUpdate(dbRef(db, "groups/" + g._cloudKey), { label:g.label, icon:g.icon });
      }else if(cloudMode==="claude" && g._cloudKey){
        await window.storage.set(g._cloudKey, JSON.stringify({ label:g.label, icon:g.icon, catKeys:g.catKeys }), true);
      }
      renderGroups(); renderDrawer();
    }catch(e){ alert("修改大类失败：" + e.message); }
  }else if(action==="2"){
    const ok = confirm(`确定删除大类「${g.icon} ${g.label}」吗？\n（里面的小类和词条都还在，只是这个大类的分组消失）`);
    if(!ok) return;
    try{
      if(cloudMode==="firebase" && g._cloudKey){
        await dbRemove(dbRef(db, "groups/" + g._cloudKey));
      }else if(cloudMode==="claude" && g._cloudKey){
        await window.storage.delete(g._cloudKey, true);
        groups = groups.filter(x=>x.key!==groupKey);
      }else{
        groups = groups.filter(x=>x.key!==groupKey);
      }
      if(openGroupKey===groupKey) openGroupKey = null;
      renderGroups(); renderDrawer();
    }catch(e){ alert("删除大类失败：" + e.message); }
  }
}

function watchGroups(){
  return new Promise(resolve=>{
    let done=false;
    dbOnValue(dbRef(db, "groups"), (snapshot)=>{
      const val = snapshot.val() || {};
      groups = Object.entries(val).map(([k,v])=>({ key:"g_"+k, label:v.label, icon:v.icon, catKeys:v.catKeys||[], _cloudKey:k }));
      renderGroups(); renderDrawer();
      if(!done){ done=true; resolve(); }
    });
  });
}
async function loadClaudeGroups(){
  try{
    const list = await window.storage.list("group:", true);
    if(!list || !list.keys) return;
    const loaded = [];
    for(const key of list.keys){
      try{
        const res = await window.storage.get(key, true);
        if(res && res.value){
          const v = JSON.parse(res.value);
          loaded.push({ key:"g_"+key, label:v.label, icon:v.icon, catKeys:v.catKeys||[], _cloudKey:key });
        }
      }catch(e){ /* 忽略 */ }
    }
    groups = loaded;
    renderGroups(); renderDrawer();
  }catch(e){ console.error("大类加载失败", e); }
}

function highlight(text, kw){
  if(!kw) return text;
  try{
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), "gi");
    return text.replace(re, m => `<mark>${m}</mark>`);
  }catch(e){ return text; }
}

// ================ 中文数字与阿拉伯数字互转，方便"第一部"匹配"第1部" ================
function cnNumToArabic(cnStr){
  const digits = {'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  if(cnStr === '十') return 10;
  if(cnStr.length === 1) return digits[cnStr] !== undefined ? digits[cnStr] : null;
  if(cnStr.includes('十')){
    const parts = cnStr.split('十');
    const tens = parts[0] === '' ? 1 : (digits[parts[0]] !== undefined ? digits[parts[0]] : null);
    const ones = parts[1] === '' ? 0 : (digits[parts[1]] !== undefined ? digits[parts[1]] : null);
    if(tens === null || ones === null) return null;
    return tens * 10 + ones;
  }
  return null;
}
function normalizeCnNumbers(str){
  return str.replace(/[零一二两三四五六七八九十]+/g, (match) => {
    const num = cnNumToArabic(match);
    return num !== null ? String(num) : match;
  });
}

// ================ 拼音混合模糊快速查询 ================
// 支持「纯首字母」「首字母+汉字混合」「全汉字」任意组合的搜索方式，例如：
// sqcdmao / sqc的mao / sqc的猫 → 均可命中「水千丞的猫」
function buildPinyinIndex(item){
  if(item._pyIndex) return item._pyIndex;
  const text = (item.q||"") + (item.a||"") + (item.extra||"");
  const chars = Array.from(text);
  let initials = [], fulls = [];
  try{
    initials = window.pinyinPro.pinyin(text, { pattern: "first", toneType: "none", type: "array" });
    fulls = window.pinyinPro.pinyin(text, { toneType: "none", type: "array" });
  }catch(e){}
  item._pyIndex = chars.map((ch,i)=>({
    ch: ch.toLowerCase(),
    initial: (initials[i]||ch).toLowerCase(),
    full: (fulls[i]||ch).toLowerCase()
  }));
  return item._pyIndex;
}

// 按顺序贪婪匹配：每个文本字符可以用「完整拼音」「首字母」或「原字符」中的任意一种
// 去消耗关键词，从而做到首字母、拼音、汉字随意混合搜索
function fuzzyPinyinMatch(item, kwLower){
  if(!kwLower) return true;
  const idx = buildPinyinIndex(item);
  let qi = 0;
  const qLen = kwLower.length;
  for(let ti=0; ti<idx.length && qi<qLen; ti++){
    const { ch, initial, full } = idx[ti];
    if(full.length>1 && kwLower.startsWith(full, qi)){
      qi += full.length;
      continue;
    }
    if(kwLower[qi] === ch){
      qi += 1;
      continue;
    }
    if(initial && kwLower[qi] === initial){
      qi += 1;
      continue;
    }
  }
  return qi >= qLen;
}

function paint(){
  const kw = keyword.trim();
  const kwLower = kw.toLowerCase();
  const allData = getAllData();
  let list = allData.filter(item=>{
    const matchCat = activeCat==="all" || item.cat===activeCat;
    if(!matchCat) return false;
    if(!kw) return true;
    const hay = normalizeCnNumbers((item.q + item.a + (item.extra||"")).toLowerCase().replace(/\s+/g, ""));
    const kwNoSpace = normalizeCnNumbers(kwLower.replace(/\s+/g, ""));
    if(hay.includes(kwNoSpace)) return true;
    if(fuzzyPinyinMatch(item, kwNoSpace)) return true;
    return false;
  });

  resultBar.textContent = kw || activeCat!=="all"
    ? `${list.length} RESULTS`
    : `${allData.length} ENTRIES · REAL-TIME SEARCH`;

  if(list.length===0){
    feed.innerHTML = `<div class="empty">— 没有找到相关内容，换个关键词试试 —</div>`;
    if (isGraphMode) renderGraph(list);
    return;
  }

  // ================= 新增：如果处于文档模式，渲染手风琴视图 =================
  if (isDocMode) {
    const grouped = {};
    list.forEach(item => {
      if (!grouped[item.cat]) grouped[item.cat] = [];
      grouped[item.cat].push(item);
    });

    feed.innerHTML = Object.keys(grouped).map((catKey, idx) => {
      const c = catInfo(catKey);
      const items = grouped[catKey];
      const bodyHtml = items.map(item => `
        <div class="doc-item">
          <div class="post-actions">
            <button class="action-btn quiz-set-btn ${item.wrongOptions && item.wrongOptions.length===2 ? 'quiz-set-done' : ''}" data-idx="${item._globalIndex}" title="设置答题选项">🔍</button>
            <button class="action-btn edit-btn" data-idx="${item._globalIndex}" title="编辑">✏️</button>
            <button class="action-btn del-btn" data-idx="${item._globalIndex}" title="删除">🗑️</button>
          </div>
          <div class="doc-item-q">${highlight(item.q, kw)}</div>
          <div class="doc-item-a"><b>${highlight(item.a, kw)}</b></div>
          ${item.extra ? `<div class="doc-item-extra">${highlight(item.extra, kw)}</div>` : ""}
        </div>
      `).join("");

      // 搜索时，如果命中结果，自动展开这个分类
      const isOpen = kw ? "open" : "";
      
      return `
        <div class="doc-folder ${isOpen}" style="animation-delay:${Math.min(idx*30, 300)}ms">
          <div class="doc-header" onclick="this.parentElement.classList.toggle('open')">
            <span>${c.icon} ${c.label} <span style="font-size:14px;color:var(--sub);font-weight:normal;margin-left:6px;">(${items.length} 词条)</span></span>
            <span style="font-size:11px; color:var(--sub)">▼</span>
          </div>
          <div class="doc-body">${bodyHtml}</div>
        </div>
      `;
    }).join("");
    return; // 结束渲染，不执行下方的标准列表渲染逻辑
  }

  // ==== 默认列表模式渲染 ====
  feed.innerHTML = list.map((item,i)=>{
    const c = catInfo(item.cat);
    return `<div class="post" draggable="true" data-global-idx="${item._globalIndex}" style="animation-delay:${Math.min(i*22,260)}ms">
      <div class="post-actions">
        <button class="action-btn quiz-set-btn ${item.wrongOptions && item.wrongOptions.length===2 ? 'quiz-set-done' : ''}" data-idx="${item._globalIndex}" title="设置答题选项">🔍</button>
        <button class="action-btn edit-btn" data-idx="${item._globalIndex}" title="编辑">✏️</button>
        <button class="action-btn del-btn" data-idx="${item._globalIndex}" title="删除">🗑️</button>
      </div>
      <div class="post-kicker">${c.icon} ${c.label}</div>
      <div class="post-q">${highlight(item.q, kw)}</div>
      <div class="post-a"><b>${highlight(item.a, kw)}</b></div>
      ${item.extra ? `<div class="post-extra">${highlight(item.extra, kw)}</div>` : ""}
    </div>`;
  }).join("");

  if (isGraphMode) renderGraph(list);
  bindDragEvents(); // 绑定拖拽
}

let meltTimer = null;
function render(instant){
  if(instant){ paint(); return; }
  clearTimeout(meltTimer);
  feed.classList.add("melting");
  meltTimer = setTimeout(()=>{
    paint();
    feed.classList.remove("melting");
  }, 140);
}

searchInput.addEventListener("input", (e)=>{
  keyword = e.target.value;
  clearBtn.style.display = keyword ? "block" : "none";
  render();
});
clearBtn.addEventListener("click", ()=>{
  searchInput.value = "";
  keyword = "";
  clearBtn.style.display = "none";
  render();
  searchInput.focus();
});

function updateIssueLine(){
  document.getElementById("issueLine").textContent = `共 ${getAllData().length} 条词条 · 实时检索`;
}
updateIssueLine();
renderStories();
paint();

const fabAdd = document.getElementById("fabAdd");
const mask = document.getElementById("mask");
const btnCancel = document.getElementById("btnCancel");
const btnSave = document.getElementById("btnSave");
const inCat = document.getElementById("inCat");
const inQ = document.getElementById("inQ");
const inA = document.getElementById("inA");
const inExtra = document.getElementById("inExtra");
const syncTip = document.querySelector(".sync-tip");

let currentEditIndex = -1;
const sheetTitle = document.getElementById("sheetTitle");

function refreshCategoryUI(){
  renderStories();
  const keepVal = inCat.value;
  inCat.innerHTML = categories
    .filter(c=>c.key!=="all")
    .map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join("")
    + `<option value="__new__">＋ 新建分类…</option>`;
  if(categories.find(c=>c.key===keepVal)) inCat.value = keepVal;
}
refreshCategoryUI();

inCat.addEventListener("change", ()=>{
  if(inCat.value !== "__new__") return;
  createNewCategory(true);
});

function watchCategories(){
  const p1 = new Promise(resolve=>{
    let done=false;
    dbOnValue(dbRef(db, "categories"), (snapshot)=>{
      const val = snapshot.val() || {};
      customCategories = Object.entries(val).map(([k,v])=>({ key:"c_"+k, label:v.label, icon:v.icon, _cloudKey:k }));
      computeCategories();
      refreshCategoryUI();
      if(!done){ done=true; resolve(); }
    });
  });
  const p2 = new Promise(resolve=>{
    let done=false;
    dbOnValue(dbRef(db, "categoryOverrides"), (snapshot)=>{
      categoryOverrides = snapshot.val() || {};
      computeCategories();
      refreshCategoryUI();
      if(!done){ done=true; resolve(); }
    });
  });
  return Promise.all([p1, p2]);
}
async function loadClaudeCategories(){
  try{
    const list = await window.storage.list("category:", true);
    if(list && list.keys){
      const custom = [];
      for(const key of list.keys){
        try{
          const res = await window.storage.get(key, true);
          if(res && res.value){
            const v = JSON.parse(res.value);
            custom.push({ key:"c_"+key, label:v.label, icon:v.icon, _cloudKey:key });
          }
        }catch(e){}
      }
      customCategories = custom;
    }
  }catch(e){ console.error("自定义分类加载失败", e); }

  try{
    const list2 = await window.storage.list("categoryOverride:", true);
    if(list2 && list2.keys){
      for(const key of list2.keys){
        try{
          const res = await window.storage.get(key, true);
          if(res && res.value){
            const builtinKey = key.replace("categoryOverride:", "");
            categoryOverrides[builtinKey] = JSON.parse(res.value);
          }
        }catch(e){}
      }
    }
  }catch(e){ console.error("内置分类覆盖记录加载失败", e); }

  computeCategories();
  refreshCategoryUI();
}
if(cloudMode==="firebase"){ syncPromises.push(watchCategories(), watchGroups()); }
else if(cloudMode==="claude"){ syncPromises.push(loadClaudeCategories(), loadClaudeGroups()); }
renderGroups();
renderDrawer();

const tipText = {
  firebase: "✅ 已连接云端数据库，三人同时打开会自动实时同步",
  claude: "已连接 Claude 云存储，其他人刷新页面后可看到",
  none: "⚠️ 未配置云端，新增内容仅本机可见，关闭页面会丢失"
};
syncTip.textContent = tipText[cloudMode];

fabAdd.addEventListener("click", ()=> {
  currentEditIndex = -1; 
  sheetTitle.textContent = "补充新词条";
  inCat.value = categories[1].key;
  inQ.value = ""; inA.value = ""; inExtra.value = "";
  mask.classList.add("show");
});
btnCancel.addEventListener("click", ()=> mask.classList.remove("show"));
mask.addEventListener("click", (e)=>{ if(e.target===mask) mask.classList.remove("show"); });

async function loadClaudeEntries(){
  try{
    const list = await window.storage.list("entry:", true);
    if(!list || !list.keys) return;
    for(const key of list.keys){
      try{
        const res = await window.storage.get(key, true);
        if(res && res.value) {
          const parsed = JSON.parse(res.value);
          parsed._cloudKey = key;
          cloudEntries.push(parsed);
        }
      }catch(e){}
    }
  }catch(e){ console.error("Claude 云存储加载失败", e); }
}

function watchFirebase(){
  return new Promise(resolve=>{
    let done=false;
    const entriesRef = dbRef(db, "entries");
    dbOnValue(entriesRef, (snapshot)=>{
      const val = snapshot.val() || {};
      cloudEntries = Object.keys(val).map(k => ({ ...val[k], _cloudKey: k }));
      updateIssueLine();
      render(true);
      if(!done){ done=true; resolve(); }
    });
  });
}

// ================= 内置词条的修改持久化 =================
// 内置 data 数组写死在代码里，本身不能云端保存；这里用"覆盖记录"的方式，
// 把用户对内置词条的编辑/题库设置存到云端，下次打开时自动合并回来。
async function saveBuiltinItemOverride(idx, fullItemData){
  const payload = { ...fullItemData };
  delete payload._globalIndex;
  try{
    if(cloudMode === "firebase"){
      await dbSet(dbRef(db, "itemOverrides/" + idx), payload);
    } else if(cloudMode === "claude"){
      await window.storage.set("itemOverride:" + idx, JSON.stringify(payload), true);
    }
  }catch(e){
    console.error("内置词条修改保存失败", e);
  }
}

async function loadItemOverrides(){
  if(cloudMode === "firebase"){
    return new Promise(resolve=>{
      let done=false;
      dbOnValue(dbRef(db, "itemOverrides"), (snapshot)=>{
        const val = snapshot.val() || {};
        Object.keys(val).forEach(idxStr=>{
          const idx = parseInt(idxStr);
          if(data[idx]) data[idx] = { ...data[idx], ...val[idxStr] };
        });
        render(true);
        if(!done){ done=true; resolve(); }
      });
    });
  } else if(cloudMode === "claude"){
    try{
      const list = await window.storage.list("itemOverride:", true);
      if(!list || !list.keys) return;
      for(const key of list.keys){
        try{
          const res = await window.storage.get(key, true);
          if(res && res.value){
            const idx = parseInt(key.replace("itemOverride:", ""));
            if(data[idx]) data[idx] = { ...data[idx], ...JSON.parse(res.value) };
          }
        }catch(e){}
      }
    }catch(e){ console.error("内置词条修改记录加载失败", e); }
  }
}
if(cloudMode==="firebase"){ syncPromises.push(loadItemOverrides()); }
else if(cloudMode==="claude"){ syncPromises.push(loadItemOverrides().then(()=> render(true))); }

if(cloudMode==="firebase"){ syncPromises.push(watchFirebase()); }
else if(cloudMode==="claude"){ syncPromises.push(loadClaudeEntries().then(()=>{ updateIssueLine(); render(true); })); }

// ================= 顶部同步进度提示条：全部同步任务完成后自动淡出消失 =================
const syncBanner = document.getElementById("syncBanner");
function hideSyncBanner(){
  if(!syncBanner) return;
  syncBanner.classList.add("hide");
  setTimeout(()=> syncBanner.remove(), 500);
}
if(cloudMode === "none" || syncPromises.length === 0){
  hideSyncBanner();
} else {
  Promise.all(syncPromises).then(hideSyncBanner).catch(hideSyncBanner);
}

btnSave.addEventListener("click", async ()=>{
  const q = inQ.value.trim();
  const a = inA.value.trim();
  if(!q || !a){ alert("问题和答案不能为空"); return; }
  const itemData = { cat: inCat.value, q, a, extra: inExtra.value.trim() || null };

  btnSave.textContent = "同步中…";
  btnSave.disabled = true;
  try{
    if(currentEditIndex === -1) {
      if(cloudMode==="firebase"){
        await dbPush(dbRef(db, "entries"), itemData);
      }else if(cloudMode==="claude"){
        const key = "entry:" + Date.now() + "_" + Math.random().toString(36).slice(2,7);
        itemData._cloudKey = key;
        await window.storage.set(key, JSON.stringify(itemData), true);
        cloudEntries.push(itemData);
        updateIssueLine(); render(true);
      }else{
        data.push(itemData);
        updateIssueLine(); render(true);
      }
    } else {
      const allData = getAllData();
      const targetItem = allData[currentEditIndex];
      const isCloud = currentEditIndex >= data.length; 

      if(isCloud) {
        if(cloudMode==="firebase"){
          await dbUpdate(dbRef(db, "entries/" + targetItem._cloudKey), itemData);
        } else if(cloudMode==="claude") {
          itemData._cloudKey = targetItem._cloudKey;
          await window.storage.set(targetItem._cloudKey, JSON.stringify(itemData), true);
          cloudEntries[currentEditIndex - data.length] = itemData;
          render(true);
        }
      } else {
        data[currentEditIndex] = itemData;
        render(true);
        saveBuiltinItemOverride(currentEditIndex, itemData);
      }
    }
    inQ.value = ""; inA.value = ""; inExtra.value = "";
    mask.classList.remove("show");
  }catch(e){
    alert("同步失败：" + e.message);
  }finally{
    btnSave.textContent = "保存并同步";
    btnSave.disabled = false;
  }
});

feed.addEventListener("click", async (e) => {
  const btn = e.target.closest('.action-btn');
  if(!btn) return;
  
  const idx = parseInt(btn.dataset.idx);
  const allData = getAllData();
  const targetItem = allData[idx];
  const isCloud = idx >= data.length;

  if(btn.classList.contains('quiz-set-btn')) {
    quizSetIndex = idx;
    quizSetQ.value = targetItem.q;
    quizSetCorrect.value = targetItem.a;
    quizWrong1.value = (targetItem.wrongOptions && targetItem.wrongOptions[0]) || "";
    quizWrong2.value = (targetItem.wrongOptions && targetItem.wrongOptions[1]) || "";
    quizSetMask.classList.add("show");
    return;
  }

  if(btn.classList.contains('edit-btn')) {
    currentEditIndex = idx;
    sheetTitle.textContent = "修改词条";
    inCat.value = targetItem.cat;
    inQ.value = targetItem.q;
    inA.value = targetItem.a;
    inExtra.value = targetItem.extra || "";
    mask.classList.add("show");
  } 
  else if(btn.classList.contains('del-btn')) {
    if(!confirm("确定要删除这条记录吗？")) return;
    try {
      if(isCloud) {
        if(cloudMode === "firebase") {
          await dbRemove(dbRef(db, "entries/" + targetItem._cloudKey));
        } else if(cloudMode === "claude") {
          await window.storage.delete(targetItem._cloudKey);
          cloudEntries.splice(idx - data.length, 1);
        }
      } else {
        data.splice(idx, 1);
      }
      updateIssueLine(); render(true);
    } catch(err) { alert("删除失败：" + err.message); }
  }
});

// 桌面端：鼠标移到词条上显示图标，移开消失
feed.addEventListener("mouseover", (e) => {
  const item = e.target.closest('.post, .doc-item');
  if(item) item.classList.add('active');
});
feed.addEventListener("mouseout", (e) => {
  const item = e.target.closest('.post, .doc-item');
  if(item) item.classList.remove('active');
});

// 移动端：手指划到哪个词条上，就显示哪个词条的图标；划走或抬起手指立即消失
let touchActiveItem = null;
feed.addEventListener("touchstart", handleTouchHover, {passive:true});
feed.addEventListener("touchmove", handleTouchHover, {passive:true});
function handleTouchHover(e){
  if(isTouchDragging) return;
  const touch = e.touches[0];
  if(!touch) return;
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const item = el ? el.closest('.post, .doc-item') : null;
  if(item === touchActiveItem) return;
  if(touchActiveItem) touchActiveItem.classList.remove('active');
  if(item){
    item.classList.add('active');
    touchActiveItem = item;
  } else {
    touchActiveItem = null;
  }
}
function clearTouchActive(){
  if(touchActiveItem){
    touchActiveItem.classList.remove('active');
    touchActiveItem = null;
  }
}
feed.addEventListener("touchend", clearTouchActive);
feed.addEventListener("touchcancel", clearTouchActive);

let dragStartIndex = -1;

// ================= 拖拽自动滚动 =================
let autoScrollInterval = null;
function autoScrollCheck(clientY){
  const threshold = 80;
  const vh = window.innerHeight;
  stopAutoScroll();
  if(clientY < threshold){
    const speed = (threshold - clientY) / threshold;
    autoScrollInterval = setInterval(() => {
      window.scrollBy(0, -(12 * speed + 3));
    }, 16);
  } else if(clientY > vh - threshold){
    const speed = (clientY - (vh - threshold)) / threshold;
    autoScrollInterval = setInterval(() => {
      window.scrollBy(0, 12 * speed + 3);
    }, 16);
  }
}
function stopAutoScroll(){
  if(autoScrollInterval){
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }
}

// ================= 通用：把词条移动到目标位置（同数组内真插入，跨数组则交换） =================
function moveItem(startIdx, endIdx, insertBefore){
  if(startIdx === endIdx) return;
  const isStartCloud = startIdx >= data.length;
  const isEndCloud = endIdx >= data.length;

  if(isStartCloud === isEndCloud){
    const arr = isStartCloud ? cloudEntries : data;
    const sArrIdx = isStartCloud ? (startIdx - data.length) : startIdx;
    let eArrIdx = isEndCloud ? (endIdx - data.length) : endIdx;

    const [moved] = arr.splice(sArrIdx, 1);
    if(sArrIdx < eArrIdx) eArrIdx -= 1;
    const insertIdx = insertBefore ? eArrIdx : eArrIdx + 1;
    arr.splice(insertIdx, 0, moved);
  } else {
    let startArr = isStartCloud ? cloudEntries : data;
    let startArrIdx = isStartCloud ? (startIdx - data.length) : startIdx;
    let endArr = isEndCloud ? cloudEntries : data;
    let endArrIdx = isEndCloud ? (endIdx - data.length) : endIdx;
    let temp = startArr[startArrIdx];
    startArr[startArrIdx] = endArr[endArrIdx];
    endArr[endArrIdx] = temp;
  }
  render(true);
}

// ================= 桌面端：原生拖拽 =================
function bindDragEvents() {
  const posts = document.querySelectorAll('.post');
  let dragInsertBefore = true;

  posts.forEach(post => {
    post.addEventListener('dragstart', function(e) {
      dragStartIndex = parseInt(this.dataset.globalIdx);
      this.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    post.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = this.getBoundingClientRect();
      const isTopHalf = (e.clientY - rect.top) < rect.height / 2;
      posts.forEach(p => p.classList.remove('drag-over-top', 'drag-over-bottom'));
      this.classList.add(isTopHalf ? 'drag-over-top' : 'drag-over-bottom');
      dragInsertBefore = isTopHalf;
      autoScrollCheck(e.clientY);
    });
    post.addEventListener('dragleave', function() {
      this.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    post.addEventListener('dragend', function() {
      this.classList.remove('dragging');
      posts.forEach(p => p.classList.remove('drag-over-top', 'drag-over-bottom'));
      stopAutoScroll();
    });
    post.addEventListener('drop', function(e) {
      e.stopPropagation();
      this.classList.remove('drag-over-top', 'drag-over-bottom');
      stopAutoScroll();
      const dragEndIndex = parseInt(this.dataset.globalIdx);
      moveItem(dragStartIndex, dragEndIndex, dragInsertBefore);
    });
  });
}

// ================= 移动端：长按拖拽排序 =================
let longPressTimer = null;
let dragTouchItem = null;
let dragTouchStartX = 0;
let dragTouchStartY = 0;
let isTouchDragging = false;
let touchDragOverItem = null;
let touchInsertBefore = true;

feed.addEventListener("touchstart", function(e){
  const item = e.target.closest('.post');
  if(!item) return;
  if(e.target.closest('.action-btn')) return; // 点在编辑/删除图标上不触发拖拽
  const touch = e.touches[0];
  dragTouchStartX = touch.clientX;
  dragTouchStartY = touch.clientY;
  dragTouchItem = item;
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    isTouchDragging = true;
    item.classList.add('dragging');
    if(navigator.vibrate) navigator.vibrate(30);
  }, 450);
}, {passive:true});

feed.addEventListener("touchmove", function(e){
  if(!dragTouchItem) return;
  const touch = e.touches[0];

  if(!isTouchDragging){
    if(Math.abs(touch.clientX - dragTouchStartX) > 10 || Math.abs(touch.clientY - dragTouchStartY) > 10){
      clearTimeout(longPressTimer);
      dragTouchItem = null;
    }
    return;
  }

  e.preventDefault(); // 拖拽中禁止页面自身的滚动手势，改由 autoScrollCheck 接管
  autoScrollCheck(touch.clientY);

  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const overItem = el ? el.closest('.post') : null;
  if(touchDragOverItem && touchDragOverItem !== overItem){
    touchDragOverItem.classList.remove('drag-over-top', 'drag-over-bottom');
    touchDragOverItem = null;
  }
  if(overItem && overItem !== dragTouchItem){
    const rect = overItem.getBoundingClientRect();
    const isTopHalf = (touch.clientY - rect.top) < rect.height / 2;
    overItem.classList.remove('drag-over-top', 'drag-over-bottom');
    overItem.classList.add(isTopHalf ? 'drag-over-top' : 'drag-over-bottom');
    touchInsertBefore = isTopHalf;
    touchDragOverItem = overItem;
  }
}, {passive:false});

function finishTouchDrag(){
  clearTimeout(longPressTimer);
  stopAutoScroll();
  if(isTouchDragging && dragTouchItem){
    dragTouchItem.classList.remove('dragging');
    if(touchDragOverItem){
      touchDragOverItem.classList.remove('drag-over-top', 'drag-over-bottom');
      const startIdx = parseInt(dragTouchItem.dataset.globalIdx);
      const endIdx = parseInt(touchDragOverItem.dataset.globalIdx);
      moveItem(startIdx, endIdx, touchInsertBefore);
    }
  }
  isTouchDragging = false;
  dragTouchItem = null;
  touchDragOverItem = null;
}
feed.addEventListener("touchend", finishTouchDrag);
feed.addEventListener("touchcancel", finishTouchDrag);

// ================= 图表与文档模式切换 =================
const graphToggleBtn = document.getElementById("graphToggleBtn");
const docToggleBtn = document.getElementById("docToggleBtn"); // 新增
const graphContainer = document.getElementById("graphContainer");
const graphModeSwitch = document.getElementById("graphModeSwitch");
let myChart = null;
let graphViewMode = "network"; 

// 监听文档模式按钮
docToggleBtn.addEventListener("click", () => {
  isDocMode = !isDocMode;
  if(isDocMode) {
    docToggleBtn.classList.add("active");
    docToggleBtn.textContent = "返回列表模式";
    
    // 如果启用了图表模式，强制关闭它（状态互斥）
    isGraphMode = false;
    graphToggleBtn.classList.remove("active");
    graphToggleBtn.textContent = "🕸️ 图表模式";
    graphContainer.style.display = "none";
    graphModeSwitch.style.display = "none";
    feed.style.display = "flex";
  } else {
    docToggleBtn.classList.remove("active");
    docToggleBtn.textContent = "📄 文档模式";
  }
  render(true);
});

// 监听图表模式按钮
graphToggleBtn.addEventListener("click", () => {
  isGraphMode = !isGraphMode;
  if(isGraphMode) {
    // 互斥：关闭文档模式
    isDocMode = false;
    docToggleBtn.classList.remove("active");
    docToggleBtn.textContent = "📄 文档模式";

    graphToggleBtn.classList.add("active");
    graphToggleBtn.textContent = "返回列表模式";
    feed.style.display = "none";
    graphContainer.style.display = "block";
    graphModeSwitch.style.display = "flex";
    renderGraph(getAllData()); 
  } else {
    graphToggleBtn.classList.remove("active");
    graphToggleBtn.textContent = "🕸️ 图表模式";
    feed.style.display = "flex";
    graphContainer.style.display = "none";
    graphModeSwitch.style.display = "none";
    if(myChart) myChart.dispose();
    myChart = null;
  }
  render(true); // 刷新以恢复正确的 feed 布局
});

graphModeSwitch.querySelectorAll(".graph-mode-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    graphViewMode = btn.dataset.mode;
    graphModeSwitch.querySelectorAll(".graph-mode-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    renderGraph(getAllData());
  });
});

// ================= 通用：更新某个词条的任意字段（用于保存答题选项） =================
async function updateItemFields(idx, patchFields){
  const allData = getAllData();
  const targetItem = allData[idx];
  const isCloud = idx >= data.length;
  const merged = { ...targetItem, ...patchFields };
  delete merged._globalIndex;

  if(isCloud){
    if(cloudMode === "firebase"){
      await dbUpdate(dbRef(db, "entries/" + targetItem._cloudKey), patchFields);
      cloudEntries[idx - data.length] = merged;
    } else if(cloudMode === "claude"){
      const cloudKey = targetItem._cloudKey;
      const full = { ...merged, _cloudKey: cloudKey };
      await window.storage.set(cloudKey, JSON.stringify(full), true);
      cloudEntries[idx - data.length] = full;
    }
  } else {
    data[idx] = merged;
    saveBuiltinItemOverride(idx, merged);
  }
  render(true);
}

// ================= 设置答题选项弹窗 =================
const quizSetMask = document.getElementById("quizSetMask");
const quizSetQ = document.getElementById("quizSetQ");
const quizSetCorrect = document.getElementById("quizSetCorrect");
const quizWrong1 = document.getElementById("quizWrong1");
const quizWrong2 = document.getElementById("quizWrong2");
const quizSetCancel = document.getElementById("quizSetCancel");
const quizSetSave = document.getElementById("quizSetSave");
let quizSetIndex = -1;

quizSetCancel.addEventListener("click", () => {
  quizSetMask.classList.remove("show");
});

quizSetSave.addEventListener("click", async () => {
  const w1 = quizWrong1.value.trim();
  const w2 = quizWrong2.value.trim();
  if(!w1 || !w2){ alert("两个错误选项都要填写"); return; }
  quizSetSave.textContent = "保存中…";
  quizSetSave.disabled = true;
  try{
    await updateItemFields(quizSetIndex, { wrongOptions: [w1, w2] });
    quizSetMask.classList.remove("show");
  }catch(e){
    alert("保存失败：" + e.message);
  }finally{
    quizSetSave.textContent = "保存";
    quizSetSave.disabled = false;
  }
});

// ================= 答题模式 =================
const quizToggleBtn = document.getElementById("quizToggleBtn");
const quizMask = document.getElementById("quizMask");
const quizCloseBtn = document.getElementById("quizCloseBtn");
const quizTimerFg = document.getElementById("quizTimerFg");
const quizTimerValue = document.getElementById("quizTimerValue");
const quizProgressText = document.getElementById("quizProgressText");
const quizProgressFill = document.getElementById("quizProgressFill");
const quizQuestion = document.getElementById("quizQuestion");
const quizOptions = document.getElementById("quizOptions");
const scrollMask = document.getElementById("scrollMask");
const scrollTitle = document.getElementById("scrollTitle");
const scrollContent = document.getElementById("scrollContent");
const scrollCloseBtn = document.getElementById("scrollCloseBtn");
const scrollReviewBtn = document.getElementById("scrollReviewBtn");

const QUIZ_QUESTION_COUNT = 5;
const QUIZ_TOTAL_TIME = 60;
let quizPool = [];
let quizIndex = 0;
let quizAnswers = [];
let quizTimer = null;
let quizTimeLeft = QUIZ_TOTAL_TIME;
let quizStartTimestamp = 0;
const QUIZ_TIMER_CIRCUMFERENCE = 2 * Math.PI * 45;

function shuffleArray(arr){
  return [...arr].sort(() => Math.random() - 0.5);
}

quizToggleBtn.addEventListener("click", () => {
  const allData = getAllData();
  const eligible = allData.filter(it => it.wrongOptions && it.wrongOptions.length === 2 && it.wrongOptions[0] && it.wrongOptions[1]);
  if(eligible.length < QUIZ_QUESTION_COUNT){
    alert(`已设置答题选项的词条只有 ${eligible.length} 条，至少需要 ${QUIZ_QUESTION_COUNT} 条才能开始答题模式。\n点击词条旁的 🔍 图标即可设置。`);
    return;
  }
  const picked = shuffleArray(eligible).slice(0, QUIZ_QUESTION_COUNT);
  quizPool = picked.map(it => ({
    q: it.q,
    correct: it.a,
    options: shuffleArray([it.a, it.wrongOptions[0], it.wrongOptions[1]])
  }));
  quizIndex = 0;
  quizAnswers = new Array(QUIZ_QUESTION_COUNT).fill(null);
  quizMask.classList.add("show");
  renderQuizQuestion();
  startQuizTimer();
});

function renderQuizQuestion(){
  const item = quizPool[quizIndex];
  quizProgressText.textContent = `${quizIndex + 1} / ${QUIZ_QUESTION_COUNT}`;
  quizProgressFill.style.width = `${(quizIndex / QUIZ_QUESTION_COUNT) * 100}%`;
  quizQuestion.textContent = `${quizIndex + 1}. ${item.q}`;
  const letters = ["A", "B", "C"];
  quizOptions.innerHTML = item.options.map((opt, i) => `
    <button class="quiz-option-btn" data-opt-index="${i}">
      <span class="quiz-option-letter">${letters[i]}</span>
      <span class="quiz-option-text">${opt}</span>
    </button>
  `).join("");
}

quizOptions.addEventListener("click", (e) => {
  const btn = e.target.closest(".quiz-option-btn");
  if(!btn) return;
  const optIdx = parseInt(btn.dataset.optIndex);
  quizAnswers[quizIndex] = quizPool[quizIndex].options[optIdx];
  if(quizIndex < QUIZ_QUESTION_COUNT - 1){
    quizIndex++;
    renderQuizQuestion();
  } else {
    quizProgressFill.style.width = `100%`;
    finishQuiz();
  }
});

function startQuizTimer(){
  quizStartTimestamp = Date.now();
  quizTimeLeft = QUIZ_TOTAL_TIME;
  updateQuizTimerUI();
  clearInterval(quizTimer);
  quizTimer = setInterval(quizTick, 250);
}

function quizTick(){
  const elapsed = Math.floor((Date.now() - quizStartTimestamp) / 1000);
  quizTimeLeft = Math.max(QUIZ_TOTAL_TIME - elapsed, 0);
  updateQuizTimerUI();
  if(quizTimeLeft <= 0){
    clearInterval(quizTimer);
    finishQuiz();
  }
}

// 切屏/切后台再切回来时，立刻用真实时间校正一次，避免计时器被浏览器节流导致不准
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible" && quizMask.classList.contains("show")){
    quizTick();
  }
});

function updateQuizTimerUI(){
  const m = String(Math.max(Math.floor(quizTimeLeft / 60), 0)).padStart(2, "0");
  const s = String(Math.max(quizTimeLeft % 60, 0)).padStart(2, "0");
  quizTimerValue.textContent = `${m}:${s}`;
  const pct = Math.max(quizTimeLeft, 0) / QUIZ_TOTAL_TIME;
  quizTimerFg.style.strokeDasharray = QUIZ_TIMER_CIRCUMFERENCE;
  quizTimerFg.style.strokeDashoffset = QUIZ_TIMER_CIRCUMFERENCE * (1 - pct);
}

function finishQuiz(){
  clearInterval(quizTimer);
  quizMask.classList.remove("show");

  const wrongList = [];
  quizPool.forEach((item, i) => {
    if(quizAnswers[i] !== item.correct){
      wrongList.push({ q: item.q, correct: item.correct, chosen: quizAnswers[i] || "（未作答）" });
    }
  });

  if(wrongList.length === 0){
    scrollTitle.textContent = "🎉 全部答对，挑战通过！";
    scrollContent.innerHTML = `<div class="scroll-item"><div class="scroll-your">恭喜，本次 ${QUIZ_QUESTION_COUNT} 道题全部正确。</div></div>`;
    scrollReviewBtn.style.display = "block";
  } else {
    scrollTitle.textContent = "很遗憾，未能全部通过";
    scrollContent.innerHTML = wrongList.map(w => `
      <div class="scroll-item">
        <div class="scroll-q">${w.q}</div>
        <div class="scroll-your">你的答案：${w.chosen}</div>
        <div class="scroll-correct">正确答案：${w.correct}</div>
      </div>
    `).join("");
    scrollReviewBtn.style.display = "none";
  }
  scrollMask.classList.add("show");
}

function renderQuizReview(){
  scrollTitle.textContent = "📜 答题回顾";
  scrollContent.innerHTML = quizPool.map((item, i) => `
    <div class="scroll-item">
      <div class="scroll-q">${i + 1}. ${item.q}</div>
      <div class="scroll-your">你的答案：${quizAnswers[i]}</div>
      <div class="scroll-correct">正确答案：${item.correct}</div>
    </div>
  `).join("");
  scrollReviewBtn.style.display = "none";
}

scrollReviewBtn.addEventListener("click", () => {
  renderQuizReview();
});

quizCloseBtn.addEventListener("click", () => {
  clearInterval(quizTimer);
  quizMask.classList.remove("show");
});

scrollCloseBtn.addEventListener("click", () => {
  scrollMask.classList.remove("show");
});

function renderGraph(currentList) {
  if(!isGraphMode) return;
  if(!myChart) {
    myChart = echarts.init(graphContainer);
  }
  if(graphViewMode === "mindmap"){
    renderMindmap(currentList);
  }else{
    renderNetworkGraph(currentList);
  }
}

function renderNetworkGraph(currentList) {
  const nodes = [];
  const links = [];
  const rootName = "188 速查网络";

  nodes.push({ name: rootName, symbolSize: 50, itemStyle: { color: '#151414' }, label: { show: true, fontSize: 16 } });

  const usedCats = new Set();
  currentList.forEach(item => {
    const catObj = catInfo(item.cat);
    if(!usedCats.has(item.cat)) {
      usedCats.add(item.cat);
      nodes.push({ name: catObj.label, symbolSize: 35, itemStyle: { color: '#A8321E' }, label: { show: true } });
      links.push({ source: rootName, target: catObj.label });
    }
    const nodeName = item.q; 
    nodes.push({ 
      name: nodeName, 
      value: item.a, 
      symbolSize: 15, 
      itemStyle: { color: '#8a8783' }, 
      label: { show: false } 
    });
    links.push({ source: catObj.label, target: nodeName });
  });

  const option = {
    tooltip: {
      formatter: function(params) {
        if(params.data.value) return `<b>Q:</b> ${params.data.name}<br><b>A:</b> <span style="color:#A8321E">${params.data.value}</span>`;
        return params.name;
      }
    },
    series: [
      {
        type: 'graph',
        layout: 'force',
        data: nodes,
        links: links,
        roam: true,
        label: { position: 'right' },
        force: { repulsion: 200, edgeLength: [50, 150] },
        lineStyle: { color: 'source', curveness: 0.2 }
      }
    ]
  };
  myChart.setOption(option, true);
}

function renderMindmap(currentList) {
  const catMap = new Map();
  currentList.forEach(item=>{
    const catObj = catInfo(item.cat);
    if(!catMap.has(item.cat)){
      catMap.set(item.cat, { name: `${catObj.icon} ${catObj.label}`, children: [] });
    }
    catMap.get(item.cat).children.push({
      name: item.q,
      value: item.a,
      children: item.extra ? [{ name: "💡 " + item.extra }] : []
    });
  });

  const treeData = [{
    name: "188 速查",
    children: Array.from(catMap.values())
  }];

  const option = {
    tooltip: {
      formatter: function(params){
        if(params.data.value) return `<b>Q:</b> ${params.data.name}<br><b>A:</b> <span style="color:#A8321E">${params.data.value}</span>`;
        return params.name;
      }
    },
    series: [
      {
        type: 'tree',
        data: treeData,
        top: '2%', left: '10%', bottom: '2%', right: '18%',
        symbolSize: 9,
        orient: 'LR', 
        label: { position: 'left', verticalAlign: 'middle', align: 'right', fontSize: 12 },
        leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left' } },
        itemStyle: { color: '#A8321E', borderColor: '#A8321E' },
        lineStyle: { color: '#c9c4bc', curveness: 0.5 },
        emphasis: { focus: 'descendant' },
        expandAndCollapse: true, 
        initialTreeDepth: 2,     
        animationDuration: 400,
        animationDurationUpdate: 400,
        roam: true
      }
    ]
  };
  myChart.setOption(option, true);
}

window.addEventListener('resize', () => { if(myChart) myChart.resize(); });

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
let isDocMode = false; // 记录当前是否处于文档模式
// 文档模式的三层状态：大标签(分类) -> 小标签(词条) -> 卷轴(展开内容/编辑)
let openDocCat = null;       // 当前展开的大标签(分类key)
let openDocItemIdx = null;   // 当前展开卷轴的词条 _globalIndex
let docEditMode = false;     // 卷轴是否处于编辑状态

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
  dbOnValue(dbRef(db, "groups"), (snapshot)=>{
    const val = snapshot.val() || {};
    groups = Object.entries(val).map(([k,v])=>({ key:"g_"+k, label:v.label, icon:v.icon, catKeys:v.catKeys||[], _cloudKey:k }));
    renderGroups(); renderDrawer();
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

// ================ 拼音首字母/缩写快速查询 ================
function getInitials(item){
  if(item._initials !== undefined) return item._initials;
  try{
    const text = (item.q||"") + (item.a||"") + (item.extra||"");
    const arr = window.pinyinPro.pinyin(text, { pattern: "first", toneType: "none", type: "array" });
    item._initials = arr.join("").toLowerCase();
  }catch(e){
    item._initials = "";
  }
  return item._initials;
}

function paint(){
  const kw = keyword.trim();
  const kwLower = kw.toLowerCase();
  const isAbbr = /^[a-z]+$/.test(kwLower); // 纯字母才走拼音首字母匹配
  const allData = getAllData();
  let list = allData.filter(item=>{
    const matchCat = activeCat==="all" || item.cat===activeCat;
    if(!matchCat) return false;
    if(!kw) return true;
    const hay = (item.q + item.a + (item.extra||"")).toLowerCase();
    if(hay.includes(kwLower)) return true;
    if(isAbbr && getInitials(item).includes(kwLower)) return true;
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

  // ================= 文档模式：大标签 → 小标签 → 卷轴展开/编辑 =================
  if (isDocMode) {
    const grouped = {};
    list.forEach(item => {
      if (!grouped[item.cat]) grouped[item.cat] = [];
      grouped[item.cat].push(item);
    });
    const catKeys = Object.keys(grouped);

    // 如果之前展开的大类现在不存在了（比如被搜索过滤掉），重置状态
    if(openDocCat && !catKeys.includes(openDocCat)){ openDocCat = null; openDocItemIdx = null; docEditMode = false; }
    // 搜索时自动展开第一个命中的大类，方便直接看到结果
    if(kw && catKeys.length && !openDocCat){ openDocCat = catKeys[0]; }

    const bigTagsHtml = catKeys.map(catKey=>{
      const c = catInfo(catKey);
      const activeClass = catKey===openDocCat ? "active" : "";
      return `<div class="doc-tag-big ${activeClass}" data-cat="${catKey}">${c.icon} ${c.label} <span class="doc-count">${grouped[catKey].length}</span></div>`;
    }).join("");

    let smallTagsHtml = "";
    if(openDocCat && grouped[openDocCat]){
      // 展开卷轴后如果这条已不在当前小类列表里，重置卷轴
      if(openDocItemIdx !== null && !grouped[openDocCat].some(it=>it._globalIndex===openDocItemIdx)){
        openDocItemIdx = null; docEditMode = false;
      }
      smallTagsHtml = `<div class="doc-smalltags">` + grouped[openDocCat].map(item=>{
        const activeClass = item._globalIndex===openDocItemIdx ? "active" : "";
        const shortQ = item.q.length > 16 ? item.q.slice(0,16)+"…" : item.q;
        return `<div class="doc-tag-small ${activeClass}" data-idx="${item._globalIndex}">${highlight(shortQ, kw)}</div>`;
      }).join("") + `</div>`;
    }

    let scrollHtml = "";
    if(openDocItemIdx !== null){
      const item = getAllData().find(it=>it._globalIndex===openDocItemIdx);
      if(item){
        if(docEditMode){
          scrollHtml = `
            <div class="doc-scroll open editing" data-idx="${item._globalIndex}">
              <label class="doc-scroll-label">问题</label>
              <input class="doc-edit-q" value="${item.q.replace(/"/g,'&quot;')}">
              <label class="doc-scroll-label">答案</label>
              <input class="doc-edit-a" value="${item.a.replace(/"/g,'&quot;')}">
              <label class="doc-scroll-label">拓展说明</label>
              <textarea class="doc-edit-extra" placeholder="补充说明…">${item.extra||""}</textarea>
              <div class="doc-scroll-btns">
                <button class="action-btn doc-cancel-btn">取消</button>
                <button class="action-btn doc-save-btn">保存</button>
              </div>
            </div>`;
        }else{
          scrollHtml = `
            <div class="doc-scroll open" data-idx="${item._globalIndex}">
              <div class="post-actions">
                <button class="action-btn doc-edit-btn" data-idx="${item._globalIndex}" title="编辑">✏️</button>
                <button class="action-btn del-btn" data-idx="${item._globalIndex}" title="删除">🗑️</button>
              </div>
              <div class="doc-item-q">${highlight(item.q, kw)}</div>
              <div class="doc-item-a"><b>${highlight(item.a, kw)}</b></div>
              ${item.extra ? `<div class="doc-item-extra">${highlight(item.extra, kw)}</div>` : ""}
            </div>`;
        }
      }
    }

    feed.innerHTML = `<div class="doc-bigtags">${bigTagsHtml}</div>` + smallTagsHtml + scrollHtml;
    return; // 结束渲染，不执行下方的标准列表渲染逻辑
  }

  // ==== 默认列表模式渲染 ====
  feed.innerHTML = list.map((item,i)=>{
    const c = catInfo(item.cat);
    return `<div class="post" draggable="true" data-global-idx="${item._globalIndex}" style="animation-delay:${Math.min(i*22,260)}ms">
      <div class="post-actions">
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
  dbOnValue(dbRef(db, "categories"), (snapshot)=>{
    const val = snapshot.val() || {};
    customCategories = Object.entries(val).map(([k,v])=>({ key:"c_"+k, label:v.label, icon:v.icon, _cloudKey:k }));
    computeCategories();
    refreshCategoryUI();
  });
  dbOnValue(dbRef(db, "categoryOverrides"), (snapshot)=>{
    categoryOverrides = snapshot.val() || {};
    computeCategories();
    refreshCategoryUI();
  });
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
if(cloudMode==="firebase"){ watchCategories(); watchGroups(); }
else if(cloudMode==="claude"){ loadClaudeCategories(); loadClaudeGroups(); }
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
  const entriesRef = dbRef(db, "entries");
  dbOnValue(entriesRef, (snapshot)=>{
    const val = snapshot.val() || {};
    cloudEntries = Object.keys(val).map(k => ({ ...val[k], _cloudKey: k }));
    updateIssueLine();
    render(true);
  });
}

if(cloudMode==="firebase"){ watchFirebase(); }
else if(cloudMode==="claude"){ loadClaudeEntries().then(()=>{ updateIssueLine(); render(true); }); }

// 保存词条（新增或修改都走这里），idx为-1表示新增
async function saveEntryData(idx, itemData){
  if(idx === -1){
    if(cloudMode==="firebase"){
      await dbPush(dbRef(db, "entries"), itemData);
    }else if(cloudMode==="claude"){
      const key = "entry:" + Date.now() + "_" + Math.random().toString(36).slice(2,7);
      itemData._cloudKey = key;
      await window.storage.set(key, JSON.stringify(itemData), true);
      cloudEntries.push(itemData);
    }else{
      data.push(itemData);
    }
  }else{
    const allData = getAllData();
    const targetItem = allData[idx];
    const isCloud = idx >= data.length;
    if(isCloud){
      if(cloudMode==="firebase"){
        await dbUpdate(dbRef(db, "entries/" + targetItem._cloudKey), itemData);
      }else if(cloudMode==="claude"){
        itemData._cloudKey = targetItem._cloudKey;
        await window.storage.set(targetItem._cloudKey, JSON.stringify(itemData), true);
        cloudEntries[idx - data.length] = itemData;
      }
    }else{
      data[idx] = itemData;
    }
  }
  updateIssueLine();
}

btnSave.addEventListener("click", async ()=>{
  const q = inQ.value.trim();
  const a = inA.value.trim();
  if(!q || !a){ alert("问题和答案不能为空"); return; }
  const itemData = { cat: inCat.value, q, a, extra: inExtra.value.trim() || null };

  btnSave.textContent = "同步中…";
  btnSave.disabled = true;
  try{
    await saveEntryData(currentEditIndex, itemData);
    render(true);
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

// ================ 文档模式：大标签 / 小标签 / 卷轴内联编辑 的交互 ================
feed.addEventListener("click", async (e)=>{
  // 点大标签：展开/收起对应分类的小标签
  const bigTag = e.target.closest(".doc-tag-big");
  if(bigTag){
    const catKey = bigTag.dataset.cat;
    openDocCat = (openDocCat === catKey) ? null : catKey;
    openDocItemIdx = null;
    docEditMode = false;
    render(true);
    return;
  }

  // 点小标签：展开/收起卷轴
  const smallTag = e.target.closest(".doc-tag-small");
  if(smallTag){
    const idx = parseInt(smallTag.dataset.idx);
    openDocItemIdx = (openDocItemIdx === idx) ? null : idx;
    docEditMode = false;
    render(true);
    return;
  }

  // 点"编辑"：卷轴切换为可编辑状态
  const docEditBtn = e.target.closest(".doc-edit-btn");
  if(docEditBtn){
    docEditMode = true;
    render(true);
    return;
  }

  // 点"取消"：退出编辑，不保存
  const docCancelBtn = e.target.closest(".doc-cancel-btn");
  if(docCancelBtn){
    docEditMode = false;
    render(true);
    return;
  }

  // 点"保存"：把卷轴内输入框的内容写回
  const docSaveBtn = e.target.closest(".doc-save-btn");
  if(docSaveBtn){
    const scrollEl = docSaveBtn.closest(".doc-scroll");
    const idx = parseInt(scrollEl.dataset.idx);
    const q = scrollEl.querySelector(".doc-edit-q").value.trim();
    const a = scrollEl.querySelector(".doc-edit-a").value.trim();
    const extra = scrollEl.querySelector(".doc-edit-extra").value.trim();
    if(!q || !a){ alert("问题和答案不能为空"); return; }
    const targetItem = getAllData().find(it=>it._globalIndex===idx);
    const itemData = { cat: targetItem.cat, q, a, extra: extra || null };
    docSaveBtn.textContent = "同步中…";
    docSaveBtn.disabled = true;
    try{
      await saveEntryData(idx, itemData);
      docEditMode = false;
      render(true);
    }catch(err){
      alert("同步失败：" + err.message);
    }
    return;
  }
});

let dragStartIndex = -1;
function bindDragEvents() {
  const posts = document.querySelectorAll('.post');
  posts.forEach(post => {
    post.addEventListener('dragstart', function(e) {
      dragStartIndex = parseInt(this.dataset.globalIdx);
      this.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    post.addEventListener('dragover', function(e) {
      e.preventDefault();
      this.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    });
    post.addEventListener('dragleave', function() {
      this.classList.remove('drag-over');
    });
    post.addEventListener('dragend', function() {
      this.classList.remove('dragging');
      posts.forEach(p => p.classList.remove('drag-over'));
    });
    post.addEventListener('drop', function(e) {
      e.stopPropagation();
      this.classList.remove('drag-over');
      const dragEndIndex = parseInt(this.dataset.globalIdx);
      if(dragStartIndex === dragEndIndex) return;

      const allData = getAllData();
      const isStartCloud = dragStartIndex >= data.length;
      const isEndCloud = dragEndIndex >= data.length;
      
      let startArr = isStartCloud ? cloudEntries : data;
      let startArrIdx = isStartCloud ? (dragStartIndex - data.length) : dragStartIndex;
      let endArr = isEndCloud ? cloudEntries : data;
      let endArrIdx = isEndCloud ? (dragEndIndex - data.length) : dragEndIndex;

      let temp = startArr[startArrIdx];
      startArr[startArrIdx] = endArr[endArrIdx];
      endArr[endArrIdx] = temp;

      render(true);
    });
  });
}

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
  openDocCat = null; openDocItemIdx = null; docEditMode = false;
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

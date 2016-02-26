var NODE_WIDTH = 10;
var PIXI = require('pixi.js');

module.exports = function (graph, settings) {
  var merge = require('ngraph.merge');

  // Initialize default settings:
  settings = merge(settings, {
    // What is the background color of a graph?
    background: 0x000000,

    // Use antialiasing or not
    antialias: true,

    // Default physics engine settings
    physics: {
      springLength: 30,
      springCoeff: 0.0008,
      dragCoeff: 0.01,
      gravity: -1.2,
      theta: 1
    }
  });

  // Where do we render our graph?
  if (typeof settings.container === 'undefined') {
    settings.container = document.body;
  }

  // If client does not need custom layout algorithm, let's create default one:
  var layout = settings.layout;

  if (!layout) {
    var createLayout = require('ngraph.forcelayout'),
        // physics = require('ngraph.physics.simulator');

    layout = createLayout(graph, settings.physics);
  }

  var width = settings.container.clientWidth,
      height = settings.container.clientHeight;

  var stop = true;

  var stage = new PIXI.Container();
  var group = new PIXI.Container();
  stage.addChild(group);
  // group.position.x = width/2;
  // group.position.y = height/2;
  // group.scale.x = 1;
  // group.scale.y = 1;
  var renderer = PIXI.autoDetectRenderer(width, height, {
    antialias: settings.antialias,
    backgroundColor: settings.background
  });

  // var renderer = new PIXI.CanvasRenderer(width, height, {
  //   antialias: settings.antialias,
  //   background: settings.background
  // });

  settings.container.appendChild(renderer.view);

  var graphics = new PIXI.Graphics();
  group.addChild(graphics);

  var spriteContainer = new PIXI.ParticleContainer(15000, {
    scale: true,
    position: true,
    rotation: true,
    alpha: true,
  });

  var lineSpriteContainer = new PIXI.ParticleContainer(15000, {
    scale: true,
    position: true,
    rotation: true,
    alpha: true,
  });
    // var spriteContainer = new PIXI.Container();
  // spriteContainer.position.x = width/2;
  // spriteContainer.position.y = height/2;
  // spriteContainer.scale.x = 1;
  // spriteContainer.scale.y = 1;
  group.addChild(lineSpriteContainer);
  group.addChild(spriteContainer);

  var nodeTexture = generateTexture(function (gfx) {
    gfx.beginFill(0xFF3300);
    // gfx.drawRect(0, 0, NODE_WIDTH, NODE_WIDTH);
    gfx.drawCircle(0, 0, NODE_WIDTH / 2);
  });

  var DEFAULT_LINE_LENGTH = 500;

  var linkTexture = generateTexture(function (gfx) {
    gfx.lineStyle(1, 0xcccccc, 1);
    gfx.moveTo(0, 0);
    gfx.lineTo(DEFAULT_LINE_LENGTH, 0);
  });

  // Default callbacks to build/render nodes
  var nodeUIBuilder = defaultCreateNodeUI,
      nodeRenderer  = defaultNodeRenderer,
      linkUIBuilder = defaultCreateLinkUI,
      linkRenderer  = defaultLinkRenderer;

  // Storage for UI of nodes/links:
  var nodeUI = {}, linkUI = {};

  var nodeSprites = {};
  var linkSprites = {};

  graph.forEachNode(initNode);
  graph.forEachLink(initLink);

  listenToGraphEvents();

  var pixiGraphics = {
    /**
     * Allows client to start animation loop, without worrying about RAF stuff.
     */
    run: function () {
      stop = false;
      settings.stats ? animationLoopWithStats() : animationLoop();
    },

    stop: function () {
      stop = true;
    },

    /**
     * For more sophisticated clients we expose one frame rendering as part of
     * API. This may be useful for clients who have their own RAF pipeline.
     */
    renderOneFrame: renderOneFrame,

    /**
     * This callback creates new UI for a graph node. This becomes helpful
     * when you want to precalculate some properties, which otherwise could be
     * expensive during rendering frame.
     *
     * @callback createNodeUICallback
     * @param {object} node - graph node for which UI is required.
     * @returns {object} arbitrary object which will be later passed to renderNode
     */
    /**
     * This function allows clients to pass custom node UI creation callback
     *
     * @param {createNodeUICallback} createNodeUICallback - The callback that
     * creates new node UI
     * @returns {object} this for chaining.
     */
    createNodeUI : function (createNodeUICallback) {
      nodeUI = {};
      nodeUIBuilder = createNodeUICallback;
      graph.forEachNode(initNode);
      return this;
    },

    /**
     * This callback is called by pixiGraphics when it wants to render node on
     * a screen.
     *
     * @callback renderNodeCallback
     * @param {object} node - result of createNodeUICallback(). It contains anything
     * you'd need to render a node
     * @param {PIXI.Graphics} ctx - PIXI's rendering context.
     */
    /**
     * Allows clients to pass custom node rendering callback
     *
     * @param {renderNodeCallback} renderNodeCallback - Callback which renders
     * node.
     *
     * @returns {object} this for chaining.
     */
    renderNode: function (renderNodeCallback) {
      nodeRenderer = renderNodeCallback;
      return this;
    },

    /**
     * This callback creates new UI for a graph link. This becomes helpful
     * when you want to precalculate some properties, which otherwise could be
     * expensive during rendering frame.
     *
     * @callback createLinkUICallback
     * @param {object} link - graph link for which UI is required.
     * @returns {object} arbitrary object which will be later passed to renderNode
     */
    /**
     * This function allows clients to pass custom node UI creation callback
     *
     * @param {createLinkUICallback} createLinkUICallback - The callback that
     * creates new link UI
     * @returns {object} this for chaining.
     */
    createLinkUI : function (createLinkUICallback) {
      linkUI = {};
      linkUIBuilder = createLinkUICallback;
      graph.forEachLink(initLink);
      return this;
    },

    /**
     * This will update stage size depending on the current container size
     */
    refresh: function () {
      width = settings.container.clientWidth;
      height = settings.container.clientHeight;
      renderer.resize(width, height);
      group.hitArea = new PIXI.Rectangle(0, 0, renderer.width, renderer.height);
    },

    /**
     * This callback is called by pixiGraphics when it wants to render link on
     * a screen.
     *
     * @callback renderLinkCallback
     * @param {object} link - result of createLinkUICallback(). It contains anything
     * you'd need to render a link
     * @param {PIXI.Graphics} ctx - PIXI's rendering context.
     */
    /**
     * Allows clients to pass custom link rendering callback
     *
     * @param {renderLinkCallback} renderLinkCallback - Callback which renders
     * link.
     *
     * @returns {object} this for chaining.
     */
    renderLink: function (renderLinkCallback) {
      linkRenderer = renderLinkCallback;
      return this;
    },

    /**
     * Tries to get node at (x, y) graph coordinates. By default renderer assumes
     * width and height of the node is 10 pixels. But if your createNodeUICallback
     * returns object with `width` and `height` attributes, they are considered
     * as actual dimensions of a node
     *
     * @param {Number} x - x coordinate of a node in layout's coordinates
     * @param {Number} y - y coordinate of a node in layout's coordinates
     * @returns {Object} - actual graph node located at (x, y) coordinates.
     * If there is no node in that are `undefined` is returned.
     *
     * TODO: This should be part of layout itself
     */
    getNodeAt: getNodeAt,

    /**
     * [Read only] Current layout algorithm. If you want to pass custom layout
     * algorithm, do it via `settings` argument of ngraph.pixi.
     */
    layout: layout,

    // TODO: These properties seem to only be required of graph input. I'd really
    // like to hide them, but not sure how to do it nicely
    domContainer: renderer.view,
    graphGraphics: graphics,
    renderer: renderer,
    stage: stage,
    group: group,
    hideWhatIsNotVisible: hideWhatIsNotVisible
  };

  // listen to mouse events
  var graphInput = require('./lib/graphInput');
  var zoom = graphInput(pixiGraphics);
  zoom.scale(0.5);
  zoom.translate([width/2.5, height/2.5]);
  zoom.event(d3.transition().duration(750));

  return pixiGraphics;

///////////////////////////////////////////////////////////////////////////////
// Public API is over
///////////////////////////////////////////////////////////////////////////////

  function generateTexture(rndr) {
    var g = new PIXI.Graphics();
    rndr(g);
    return g.generateTexture(1, PIXI.SCALE_MODES.DEFAULT);
  }

  function animationLoop() {
    requestAnimationFrame(animationLoop);
    if (!stop)
      stop = layout.step();
    renderOneFrame();
  }

  function animationLoopWithStats() {
    settings.stats.begin();
    renderOneFrame();
    settings.stats.end();
    if (!stop)
      stop = layout.step();
    requestAnimationFrame(animationLoopWithStats);
  }

  function renderOneFrame() {
    // graphics.clear();

    Object.keys(linkUI).forEach(renderLink);
    Object.keys(nodeUI).forEach(renderNode);

    renderer.render(stage);
  }

  function renderLink(linkId) {
    linkRenderer(linkUI[linkId], graphics, linkId);
  }

  function renderNode(nodeId) {
    nodeRenderer(nodeUI[nodeId], graphics, nodeId);
  }

  function initNode(node) {
    var ui = nodeUIBuilder(node);
    // augment it with position data:
    ui.pos = layout.getNodePosition(node.id);
    // and store for subsequent use:
    nodeUI[node.id] = ui;
    nodeSprites[node.id] = new PIXI.Sprite(nodeTexture);
    spriteContainer.addChild(nodeSprites[node.id]);
  }

  function initLink(link) {
    var ui = linkUIBuilder(link);
    ui.from = layout.getNodePosition(link.fromId);
    ui.to = layout.getNodePosition(link.toId);
    linkUI[link.id] = ui;
    linkSprites[link.id] = new PIXI.Sprite(linkTexture);
    lineSpriteContainer.addChild(linkSprites[link.id]);
  }

  function defaultCreateNodeUI() {
    return {};
  }

  function defaultCreateLinkUI() {
    return {};
  }

  function defaultNodeRenderer(node, gfx, nodeId) {
    var x = node.pos.x - NODE_WIDTH/2,
        y = node.pos.y - NODE_WIDTH/2;

    // graphics.beginFill(0xFF3300);
    // graphics.drawRect(x, y, NODE_WIDTH, NODE_WIDTH);
    nodeSprites[nodeId].position.x = x;
    nodeSprites[nodeId].position.y = y;
  }

  function hideWhatIsNotVisible(bbox) {
    var counter = 0;
    var total = spriteContainer.children.length;
    spriteContainer.children.forEach(function (sprite) {
      var pos = sprite.toGlobal(stage.position);
      if (pos.x > bbox.width || pos.y > bbox.height || pos.x < bbox.x || pos.y < bbox.y)
        sprite.visible = false;
      else
        sprite.visible = true;
    });
  }

  function defaultLinkRenderer(link, gfx, linkId) {
    var dy = link.to.y - link.from.y;
    var dx = link.to.x - link.from.x;
    var angle = Math.atan2(dy, dx);
    var dist = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    var lsp = linkSprites[linkId];
    lsp.scale.x = dist / DEFAULT_LINE_LENGTH;
    lsp.scale.y = 1.0;
    lsp.rotation = angle;
    lsp.position.x = link.from.x;
    lsp.position.y = link.from.y;
    // linkSprites[linkId].position.x = x;
    // linkSprites[linkId].position.y = y;
  }

  // function defaultLinkRenderer(link) {
  //   graphics.lineStyle(1, 0xcccccc, 1);
  //   graphics.moveTo(link.from.x, link.from.y);
  //   graphics.lineTo(link.to.x, link.to.y);
  // }

  function getNodeAt(x, y) {
    var half = NODE_WIDTH/2;
    // currently it's a linear search, but nothing stops us from refactoring
    // this into spatial lookup data structure in future:
    for (var nodeId in nodeUI) {
      if (nodeUI.hasOwnProperty(nodeId)) {
        var node = nodeUI[nodeId];
        var pos = node.pos;
        var width = node.width || NODE_WIDTH;
        half = width/2;
        var insideNode = pos.x - half < x && x < pos.x + half &&
                         pos.y - half < y && y < pos.y + half;

        if (insideNode) {
          return graph.getNode(nodeId);
        }
      }
    }
  }

  function listenToGraphEvents() {
    graph.on('changed', onGraphChanged);
  }

  function onGraphChanged(changes) {
    for (var i = 0; i < changes.length; ++i) {
      var change = changes[i];
      if (change.changeType === 'add') {
        if (change.node) {
          initNode(change.node);
        }
        if (change.link) {
          initLink(change.link);
        }
      } else if (change.changeType === 'remove') {
        if (change.node) {
          delete nodeUI[change.node.id];
        }
        if (change.link) {
          delete linkUI[change.link.id];
        }
      }
    }
  }
};

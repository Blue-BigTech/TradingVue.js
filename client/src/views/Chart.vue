<template>
<div>
  <div class="invalid-text" v-if="flag">Invalid symbol</div>
  <trading-vue :data="chart" :width="this.width" :height="this.height"
      :title-txt="this.title"
      :color-back="colors.colorBack"
      :color-grid="colors.colorGrid"
      :color-text="colors.colorText">
  </trading-vue>
</div>
</template>

<script>
import TradingVue from 'trading-vue-js'
let Data = [];

export default {
    name: 'chart',
    props: {
      symbol: {
        type: String,
        default: 'a'
      }
    },
    components: { TradingVue },
    methods: {
        onResize(event) {
            this.width = window.innerWidth - 20
            this.height = window.innerHeight - 10
        }
    },
    async mounted() {
        window.addEventListener('resize', this.onResize)
        await this.$http.get('http://localhost:3000/chart-data/?symbol='+this.symbol)
        .then(function (response) {
          Data = response.data.data
          console.log(Data)
        })
        .catch(function (error) {
          console.log(error)
        })
        this.chart = Data;
        if(Data.ohlcv.length == 0){
          this.flag = true;
        }
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
    },
    data() {
        return {
            flag: false,
            chart: Data,
            width: window.innerWidth - 20,
            height: window.innerHeight - 10,
            colors: {
                colorBack: '#121827',
                colorGrid: '#3e3e3e',
                colorText: '#35a776',
                candle_dw: '#e54077',
                wick_dw: '#e54077'
            },
            title: this.symbol
        }
    }
}
</script>
<style>
    .symbol-text, .invalid-text{
      position: absolute;
      width: 100%;
      left: 0px;
      text-align:center;
      top: 0px;
      z-index: 1;
    }
    .invalid-text{
      top: 60px;
    }
    body { 
      margin: 0 !important;
      background-color: #121827;
    }
</style>
